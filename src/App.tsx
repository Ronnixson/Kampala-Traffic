import { useState, useEffect, FormEvent } from 'react';
import { 
  MapPin, 
  AlertTriangle, 
  Bus, 
  Navigation, 
  Clock, 
  CloudRain, 
  Sun, 
  Send, 
  CheckCircle, 
  MessageSquare, 
  TrendingUp, 
  Bike, 
  ShieldAlert, 
  ThumbsUp, 
  Info, 
  Award,
  CircleDot,
  LogIn,
  LogOut,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { KAMPALA_NODES, INITIAL_TRAFFIC_INCIDENTS, INITIAL_BODA_REVIEWS } from './data';
import { TrafficIncident, FareQuery, FarePredictionResult, BodaReview } from './types';

// Firebase Authentication & Database SDK Integrations
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, setDoc, query, orderBy, onSnapshot } from 'firebase/firestore';

export default function App() {
  // State variables for application
  const [activeTab, setActiveTab] = useState<'traffic' | 'fare' | 'boda'>('traffic');
  const [keyStatus, setKeyStatus] = useState<{ checked: boolean; available: boolean }>({ checked: false, available: false });
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  
  // Section 1: Traffic Map Feed States
  const [incidents, setIncidents] = useState<TrafficIncident[]>(INITIAL_TRAFFIC_INCIDENTS);
  const [selectedNode, setSelectedNode] = useState<string | null>('seeta');
  const [rawTrafficInput, setRawTrafficInput] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [isSubmittingTraffic, setIsSubmittingTraffic] = useState(false);
  const [trafficError, setTrafficError] = useState<string | null>(null);

  // Section 2: Fare Predictor States
  const [fareQuery, setFareQuery] = useState<FareQuery>({
    start: 'old_park',
    destination: 'ntinda',
    weather: 'Clear',
    timeOfDay: 'Off-Peak',
  });
  const [prediction, setPrediction] = useState<FarePredictionResult | null>({
    baseFare: 2000,
    predictedRange: [2000, 2500],
    multiplier: 1.0,
    timeBonus: 0,
    bestStage: 'Old Taxi Park - Ntinda Gate 2',
    explanation: 'Off-peak travel under clear skies is charged at the standard base rate.',
    localTips: [
      'Take taxis from the upper side of the park; they fill up faster.',
      'Always confirm the fare with the conductor before boarding.'
    ]
  });
  const [isSubmittingFare, setIsSubmittingFare] = useState(false);
  const [fareError, setFareError] = useState<string | null>(null);

  // Section 3: Boda Reviews States
  const [reviews, setReviews] = useState<BodaReview[]>(INITIAL_BODA_REVIEWS);
  const [riderPlate, setRiderPlate] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingBoda, setIsSubmittingBoda] = useState(false);
  const [bodaError, setBodaError] = useState<string | null>(null);

  // Synchronize Auth and Firestore Real-Time collections
  useEffect(() => {
    // 1. Auth Status stream
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    // 2. Real-time traffic incidents updates
    const unsubscribeTraffic = onSnapshot(
      collection(db, 'traffic_incidents'),
      (snapshot) => {
        const dbIncidents: TrafficIncident[] = [];
        snapshot.forEach((doc) => {
          dbIncidents.push(doc.data() as TrafficIncident);
        });
        
        // Sort by timestamp descending
        dbIncidents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Deduplicate static pre-loads
        const dbIds = new Set(dbIncidents.map(i => i.id));
        const remainingInit = INITIAL_TRAFFIC_INCIDENTS.filter(i => !dbIds.has(i.id));
        
        setIncidents([...dbIncidents, ...remainingInit]);
      },
      (error) => {
        console.error("Firestore traffic list error", error);
      }
    );

    // 3. Real-time boda-reviews warnings list
    const unsubscribeReviews = onSnapshot(
      collection(db, 'boda_reviews'),
      (snapshot) => {
        const dbReviews: BodaReview[] = [];
        snapshot.forEach((doc) => {
          dbReviews.push(doc.data() as BodaReview);
        });

        // Sort by timestamp descending
        dbReviews.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const dbIds = new Set(dbReviews.map(r => r.id));
        const remainingInit = INITIAL_BODA_REVIEWS.filter(r => !dbIds.has(r.id));
        
        setReviews([...dbReviews, ...remainingInit]);
      },
      (error) => {
        console.error("Firestore reviews list error", error);
      }
    );

    // 4. API general health and AI key check
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setKeyStatus({ checked: true, available: !!data.keyAvailable });
      })
      .catch(() => {
        setKeyStatus({ checked: true, available: false });
      });

    return () => {
      unsubscribeAuth();
      unsubscribeTraffic();
      unsubscribeReviews();
    };
  }, []);

  // Quick preset feedback templates for Traffic report testing
  const trafficTemplates = [
    { text: "Webale, traffic munji e Seeta, a trailer has broken down", label: "Seeta Breakdown (Mix)" },
    { text: "Mulimu jam mungi e Wandegeya ku roundy kubanga polisi ziziba ekkubo lya Makerere", label: "Wandegeya Police (Luganda)" },
    { text: "Ntinda Corner is moving extremely smoothly right now, no queues", label: "Ntinda Smooth (English)" },
    { text: "Heavy rainfall in Bweyogerere, cars are stagnant in deep water near the intersection", label: "Bweyogerere Rain (English)" }
  ];

  // Quick preset review templates for Boda safety testing
  const reviewTemplates = [
    { text: "Rider with registration plate UFE 123X was speeding on northern bypass without a helmet. He nearly knocked a pedestrian while swerving left.", label: "Reckless Rider" },
    { text: "My boda pilot on UFC 456Y was extremely professional. He rode with care, stopped at red lights near Jinja Road, and lent me a clean spare helmet.", label: "Exemplary Rider" },
    { text: "Rider swerved dangerously into oncoming traffic near Nakawa market to beat the lines.", label: "Dangerous Junction" }
  ];

  // Calculate stats for Boda Stage Safety dashboard
  const bodaStats = () => {
    if (reviews.length === 0) return { avgScore: 0, total: 0, criticalCount: 0 };
    const total = reviews.length;
    const sum = reviews.reduce((acc, r) => acc + r.safetyScore, 0);
    const avgScore = Number((sum / total).toFixed(1));
    const criticalCount = reviews.filter(r => r.safetyScore <= 4).length;
    return { avgScore, total, criticalCount };
  };

  // Aggregated reviews by rider (Rider Plate -> Reviews list)
  const riderAggregation = () => {
    const map: Record<string, { plate: string; avgScore: number; count: number; reviews: BodaReview[] }> = {};
    reviews.forEach(r => {
      const plate = r.riderPlate.toUpperCase();
      if (!map[plate]) {
        map[plate] = { plate, avgScore: 0, count: 0, reviews: [] };
      }
      map[plate].reviews.push(r);
      map[plate].count += 1;
    });
    Object.keys(map).forEach(plate => {
      const entry = map[plate];
      const sum = entry.reviews.reduce((acc, r) => acc + r.safetyScore, 0);
      entry.avgScore = Number((sum / entry.count).toFixed(1));
    });
    return Object.values(map).sort((a, b) => b.avgScore - a.avgScore);
  };

  // Submit dynamic traffic report
  const handleTrafficSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rawTrafficInput.trim()) return;

    if (!auth.currentUser) {
      setTrafficError('Please Sign In with Google in the top bar to crowdsource traffic signals!');
      return;
    }

    setIsSubmittingTraffic(true);
    setTrafficError(null);

    const senderName = reporterName || auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Commuter';

    try {
      const response = await fetch('/api/traffic/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput: rawTrafficInput, reportedBy: senderName })
      });
      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to submit traffic update');
      }
      const data: TrafficIncident = await response.json();
      
      // Save directly to raw Firestore under crowdsourced incidents
      try {
        await setDoc(doc(db, 'traffic_incidents', data.id), data);
      } catch (dbErr) {
        // Enforce secure handleFirestoreError diagnostic formatting
        handleFirestoreError(dbErr, OperationType.CREATE, `traffic_incidents/${data.id}`);
      }
      
      // Update selected map node to highlight newly parsed incidents immediately
      const matchedNode = KAMPALA_NODES.find(n => 
        n.name.toLowerCase().includes(data.location.toLowerCase().split(' ')[0]) ||
        data.location.toLowerCase().includes(n.name.toLowerCase().split(' ')[0])
      );
      if (matchedNode) {
        setSelectedNode(matchedNode.id);
      }
      
      setRawTrafficInput('');
      setReporterName('');
    } catch (err: any) {
      setTrafficError(err.message || 'Error occurred while contacting transit endpoint.');
    } finally {
      setIsSubmittingTraffic(false);
    }
  };

  // Calculate live Taxi Fare predictions
  const handleFarePredictSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmittingFare(true);
    setFareError(null);

    const startNode = KAMPALA_NODES.find(n => n.id === fareQuery.start)?.name || 'Central Kampala';
    const destNode = KAMPALA_NODES.find(n => n.id === fareQuery.destination)?.name || 'Destination Point';

    try {
      const response = await fetch('/api/fare/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: startNode,
          destination: destNode,
          weather: fareQuery.weather,
          timeOfDay: fareQuery.timeOfDay
        })
      });
      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to predict fare');
      }
      const resData = await response.json();
      setPrediction({
        baseFare: resData.baseFare || 2000,
        predictedRange: [resData.predictedRangeMin || 2000, resData.predictedRangeMax || 2500],
        multiplier: 1.0,
        timeBonus: 0,
        bestStage: resData.bestStage || 'Main Taxi Park Roadway',
        explanation: resData.explanation || 'Calculated dynamic fare increments.',
        localTips: resData.tips || ['Bring exact changes for taxis.']
      });
    } catch (err: any) {
      setFareError(err.message || 'Error calculating Dynamic Fare.');
    } finally {
      setIsSubmittingFare(false);
    }
  };

  // Submit Boda safety feedback
  const handleBodaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!riderPlate.trim() || !reviewText.trim()) return;

    if (!auth.currentUser) {
      setBodaError('Please Sign In with Google in the top bar to log safe / risk rider reviews!');
      return;
    }

    setIsSubmittingBoda(true);
    setBodaError(null);

    try {
      const response = await fetch('/api/boda/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderPlate, reviewText })
      });
      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to submit review');
      }
      const data: BodaReview = await response.json();
      
      // Save directly to Firestore collection securely
      try {
        await setDoc(doc(db, 'boda_reviews', data.id), data);
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.CREATE, `boda_reviews/${data.id}`);
      }

      setRiderPlate('');
      setReviewText('');
    } catch (err: any) {
      setBodaError(err.message || 'Error analyzing feedback safety metrics.');
    } finally {
      setIsSubmittingBoda(false);
    }
  };

  // Match node incidents for dynamic active map displays
  const getIncidentsForNode = (nodeId: string) => {
    const node = KAMPALA_NODES.find(n => n.id === nodeId);
    if (!node) return [];
    return incidents.filter(inc => {
      const locationWords = inc.location.toLowerCase();
      const nodeWords = node.name.toLowerCase().split(' ');
      return nodeWords.some(word => word.length > 3 && locationWords.includes(word));
    });
  };

  // Check which routes have active warnings to color lines on the vector map
  const getNodeSeverity = (nodeId: string) => {
    const matchedIncidents = getIncidentsForNode(nodeId);
    if (matchedIncidents.length === 0) return 'none';
    const severities = matchedIncidents.map(i => i.severity);
    if (severities.includes('Critical')) return 'Critical';
    if (severities.includes('High')) return 'High';
    if (severities.includes('Medium')) return 'Medium';
    return 'Low';
  };

  return (
    <div className="min-h-screen bg-[#F2F4F7] text-[#1A1C1E] font-sans selection:bg-yellow-200 selection:text-black">
      
      {/* Top Warning banner if Gemini key is missing */}
      <AnimatePresence>
        {keyStatus.checked && !keyStatus.available && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-zinc-800 text-white text-xs py-2 px-4 shadow-inner text-center font-medium flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#FFD700]" />
            <span>
              <strong>Gemini API Key is not set!</strong> The portal functions with offline mock intelligence. Set your <strong>GEMINI_API_KEY</strong> in the Secrets panel to activate raw Luganda processing.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Styled Kampala authentic header */}
      <header className="border-b border-gray-200 bg-white py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FFD700] flex items-center justify-center text-black font-extrabold text-sm shadow-xs logo-icon">
              I
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#1A1C1E] logo">ITpath-traffic</h1>
              <p className="text-xs text-slate-500 font-medium">Kampala Crowdsourced Transit & Boda Safety Ledger</p>
            </div>
          </div>

          {/* Tab Navigation and Authorization block */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            <nav className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-full sm:w-auto flex-1">
              <button
                id="tab-traffic"
                onClick={() => setActiveTab('traffic')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'traffic'
                    ? 'bg-[#1A1C1E] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Navigation className="w-4 h-4" />
                Traffic Feed & Map
              </button>
              <button
                id="tab-fare"
                onClick={() => setActiveTab('fare')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'fare'
                    ? 'bg-[#1A1C1E] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Bus className="w-4 h-4" />
                Taxi Fare Calc
              </button>
              <button
                id="tab-boda"
                onClick={() => setActiveTab('boda')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'boda'
                    ? 'bg-[#1A1C1E] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Bike className="w-4 h-4" />
                Boda Safety Board
              </button>
            </nav>

            {/* Google Authentication details display */}
            <div className="flex items-center gap-2">
              {currentUser ? (
                <div className="flex items-center gap-2.5 bg-slate-100 border border-slate-200 p-1.5 pr-3.5 rounded-xl shadow-xxs">
                  {currentUser.photoURL ? (
                    <img 
                      src={currentUser.photoURL} 
                      alt={currentUser.displayName || 'User'} 
                      className="w-7 h-7 rounded-lg object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-yellow-400 text-black flex items-center justify-center font-bold text-xs uppercase shadow-xxs">
                      {currentUser.displayName ? currentUser.displayName[0] : (currentUser.email ? currentUser.email[0] : 'U')}
                    </div>
                  )}
                  <div className="hidden lg:block text-left">
                    <div className="text-xxs font-extrabold text-slate-800 leading-tight truncate max-w-[110px]">
                      {currentUser.displayName || 'Kampala Commuter'}
                    </div>
                    <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Cloud Sync
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await signOut(auth);
                      } catch (err) {
                        console.error('Sign Out failed', err);
                      }
                    }}
                    title="Sign Out"
                    className="p-1 px-2 text-xxs bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-stone-700 font-extrabold rounded-lg transition-colors cursor-pointer border border-slate-250 shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      await signInWithPopup(auth, googleProvider);
                    } catch (err) {
                      console.error('Google authorization error', err);
                    }
                  }}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-yellow-400 bg-amber-300 hover:bg-amber-400 text-amber-950 transition-all cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <LogIn className="w-3.5 h-3.5 text-amber-950 shrink-0" />
                  Sign In with Google
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* TAB 1: CROWD-SOURCED TRAFFIC TRACKER */}
        {activeTab === 'traffic' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Interactive Kampala Node Map Panel - 7 columns wide */}
            <div className="lg:col-span-12 xl:col-span-7 card">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-[#1A1C1E] flex items-center gap-2">
                    <CircleDot className="w-5 h-5 text-amber-500" />
                    Kampala Hub Node Map
                  </h2>
                  <p className="text-xs text-slate-500">Click any transportation node below to inspect live conditions and reported delays.</p>
                </div>
                <div className="flex gap-2 text-xxs font-mono scale-90">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Clear</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Med</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> High</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" /> Crit</span>
                </div>
              </div>

              {/* Vector Connective Road Map Grid/Frame */}
              <div id="traffic-connector-map" className="relative h-96 bg-slate-950 rounded-xl overflow-hidden shadow-inner border border-stone-800">
                
                {/* Visual grid lines backdrop representing Kampala streets */}
                <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />
                <div className="absolute top-2 left-3 text-xxs font-mono text-zinc-500">GRID POSITION: KAMPALA / LAT - COORD</div>
                
                {/* Draw Vector Connection paths */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {KAMPALA_NODES.map((node) => {
                    return node.connections.map(connId => {
                      const otherNode = KAMPALA_NODES.find(n => n.id === connId);
                      if (!otherNode) return null;
                      
                      // Check worst severity between connected nodes for road color
                      const severityA = getNodeSeverity(node.id);
                      const severityB = getNodeSeverity(otherNode.id);
                      let color = 'rgba(63, 63, 70, 0.4)'; // Zinc-700
                      let strokeWidth = 3;
                      let isDashed = false;

                      if (severityA === 'Critical' || severityB === 'Critical') {
                        color = '#dc2626'; // Red-600
                        strokeWidth = 5;
                      } else if (severityA === 'High' || severityB === 'High') {
                        color = '#ef4444'; // Red-500
                        strokeWidth = 4.5;
                      } else if (severityA === 'Medium' || severityB === 'Medium') {
                        color = '#f97316'; // Orange-500
                        strokeWidth = 3.5;
                      } else if (severityA === 'Low' || severityB === 'Low') {
                        color = '#3b82f6'; // Blue-500
                        strokeWidth = 3;
                        isDashed = true;
                      }

                      return (
                        <line
                          key={`${node.id}-${connId}`}
                          x1={`${node.coordinates.x}%`}
                          y1={`${node.coordinates.y}%`}
                          x2={`${otherNode.coordinates.x}%`}
                          y2={`${otherNode.coordinates.y}%`}
                          stroke={color}
                          strokeWidth={strokeWidth}
                          strokeDasharray={isDashed ? "5, 4" : "none"}
                          className="transition-all duration-300"
                        />
                      );
                    });
                  })}
                </svg>

                {/* Draw Nodes dynamically */}
                {KAMPALA_NODES.map((node) => {
                  const nodeSeverity = getNodeSeverity(node.id);
                  const isSelected = selectedNode === node.id;
                  
                  let ringColor = 'border-slate-800 bg-slate-900 text-zinc-300';
                  let statusPulse = false;

                  if (nodeSeverity === 'Critical') {
                    ringColor = 'border-red-600 bg-red-950 text-red-200';
                    statusPulse = true;
                  } else if (nodeSeverity === 'High') {
                    ringColor = 'border-red-500 bg-red-900 text-red-100';
                    statusPulse = true;
                  } else if (nodeSeverity === 'Medium') {
                    ringColor = 'border-orange-500 bg-orange-950 text-orange-200';
                  } else if (nodeSeverity === 'Low') {
                    ringColor = 'border-blue-500 bg-blue-950 text-blue-200';
                  }

                  return (
                    <button
                      id={`node-btn-${node.id}`}
                      key={node.id}
                      onClick={() => setSelectedNode(node.id)}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 p-2 px-3 rounded-lg border text-xs font-mono font-medium transition-all ${ringColor} ${
                        isSelected 
                          ? 'ring-2 ring-amber-400 scale-110 shadow-lg z-20 font-bold' 
                          : 'scale-100 hover:scale-105 z-10 opacity-95'
                      } cursor-pointer`}
                      style={{ left: `${node.coordinates.x}%`, top: `${node.coordinates.y}%` }}
                    >
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        {statusPulse && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute -top-1 -right-1" />}
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        {node.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Inspection Node Drawer Card Detail */}
              <AnimatePresence mode="wait">
                {selectedNode && (
                  <motion.div
                    key={selectedNode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    {(() => {
                      const node = KAMPALA_NODES.find(n => n.id === selectedNode);
                      const nodeIncidents = getIncidentsForNode(selectedNode);
                      if (!node) return null;
                      
                      return (
                        <div>
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-xxs font-mono bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded uppercase font-bold">Inspect Point</span>
                              <h3 className="text-md font-bold text-slate-900">{node.name} Node Details</h3>
                            </div>
                            <span className="text-xs text-slate-500 font-mono">
                              Total Reports: <strong className="text-slate-950">{nodeIncidents.length}</strong>
                            </span>
                          </div>

                          {nodeIncidents.length === 0 ? (
                            <div className="text-center py-6 text-slate-500 bg-white rounded-lg border border-dashed border-slate-200">
                              <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                              <p className="text-sm font-medium text-slate-800">No reported traffic delays around {node.name}</p>
                              <p className="text-xs text-slate-400 mt-1">Movement is normal and clear. Report if you experience differently!</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {nodeIncidents.map(inc => {
                                const sevColors: Record<string, string> = {
                                  Low: 'bg-blue-100 border-blue-200 text-blue-800',
                                  Medium: 'bg-orange-100 border-orange-200 text-orange-800',
                                  High: 'bg-red-100 border-red-200 text-red-800',
                                  Critical: 'bg-red-900 border-red-950 text-white animate-pulse'
                                };
                                return (
                                  <div key={inc.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
                                    <div className="flex align-center justify-between gap-2 mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xxs font-bold uppercase tracking-wider px-2 py-0.5 border rounded ${sevColors[inc.severity]}`}>
                                          {inc.severity} Severity
                                        </span>
                                        <span className="text-xxs text-slate-400 font-mono flex items-center gap-1">
                                          <Clock className="w-3 h-3" />
                                          {new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      </div>
                                      <span className="text-xxs bg-stone-100 px-2 py-0.5 rounded font-mono text-stone-500">
                                        Agent User: {inc.reportedBy}
                                      </span>
                                    </div>
                                    <h4 className="text-sm font-semibold text-slate-900">{inc.cause}</h4>
                                    
                                    {inc.alternativeRouteSuggested && inc.alternativeRouteDetails && (
                                      <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-100 text-emerald-950 rounded-lg text-xs flex items-start gap-2">
                                        <Navigation className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 rotate-45" />
                                        <div>
                                          <span className="font-bold text-emerald-800">Suggested Bypass Alternative:</span>{' '}
                                          {inc.alternativeRouteDetails}
                                        </div>
                                      </div>
                                    )}

                                    <div className="mt-2 text-xxs bg-slate-50 p-2 rounded text-slate-500 font-mono italic">
                                      Raw Commuter Signal: &ldquo;{inc.rawInput}&rdquo;
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input Traffic Signal Panel & Full incident list - 5 columns */}
            <div className="lg:col-span-12 xl:col-span-5 space-y-6">
              
              {/* Traffic feedback Submission Panel */}
              <div className="card">
                <h3 className="text-md font-bold tracking-tight text-[#1A1C1E] mb-2 flex items-center gap-2">
                  <Send className="w-5 h-5 text-amber-500" />
                  Crowdsourced Transit Signal
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Did you catch traffic on Kampala Road, a stationary taxi blocking Ggaba Road, or heavy rain in Bweyogerere? Log it here in Luganda, English, or Mix!
                </p>

                {/* Feed Preset templates so users don't have to think */}
                <div className="mb-4">
                  <label className="label">Preset Local Feeds (Click to Fill)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {trafficTemplates.map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setRawTrafficInput(tpl.text);
                          setReporterName('Commuter ' + Math.floor(Math.random() * 900 + 100));
                        }}
                        className="text-xxs bg-slate-150 hover:bg-yellow-100 text-[#1A1C1E] rounded-lg px-2.5 py-1.5 transition-colors border border-gray-200 font-mono text-left cursor-pointer"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleTrafficSubmit} className="space-y-4">
                  <div>
                    <label className="label">Report Feed Text (Urgent Details)</label>
                    <textarea
                      id="traffic-input-text"
                      rows={3}
                      value={rawTrafficInput}
                      onChange={(e) => setRawTrafficInput(e.target.value)}
                      placeholder="e.g., Ba boda batugambye nti Jinja Road emanyiddwako nnyo kubanga trailer efiiridde e Seeta, bypass through Bukerere"
                      className="input-field text-xs"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Your Name</label>
                      <input
                        type="text"
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                        placeholder="e.g., Bodaboda Alex / Rogers"
                        className="input-field text-xs"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        id="submit-traffic"
                        type="submit"
                        disabled={isSubmittingTraffic || !rawTrafficInput.trim()}
                        className="predict-btn w-full h-[45px] text-xs font-bold"
                        style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '12px' }}
                      >
                        {isSubmittingTraffic ? 'AI Parsing...' : 'Broadcast Feed'}
                      </button>
                    </div>
                  </div>

                  {trafficError && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-800 rounded-xl text-xs font-medium">
                      {trafficError}
                    </div>
                  )}
                </form>
              </div>

              {/* Real-time incident list panel */}
              <div className="card">
                <h3 className="text-md font-bold tracking-tight text-[#1A1C1E] mb-3 flex items-center justify-between">
                  <span>Live Feed Logs</span>
                  <span className="text-xxs bg-emerald-50 text-emerald-800 border border-emerald-100 rounded px-2 py-0.5">Real-time Connected</span>
                </h3>
                
                <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                  {incidents.map((inc) => (
                    <div key={inc.id} className="p-3.5 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl transition-colors text-xs relative">
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <strong className="text-slate-800 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          {inc.location}
                        </strong>
                        <span className={`text-xxs font-mono uppercase bg-white border px-1.5 rounded py-0.5 font-bold ${
                          inc.severity === 'Critical' ? 'border-red-500 text-red-600' :
                          inc.severity === 'High' ? 'border-amber-500 text-amber-600' :
                          inc.severity === 'Medium' ? 'border-stone-300 text-stone-600' :
                          'border-blue-300 text-blue-600'
                        }`}>
                          {inc.severity}
                        </span>
                      </div>
                      <p className="text-slate-800 font-semibold mb-1">{inc.cause}</p>
                      
                      {inc.alternativeRouteSuggested && inc.alternativeRouteDetails && (
                        <div className="mt-2 bg-white/80 p-2 rounded-lg border border-slate-150 text-xxs text-slate-600">
                          <strong className="text-emerald-700 font-bold block mb-0.5">Alternative Workaround Route:</strong>
                          {inc.alternativeRouteDetails}
                        </div>
                      )}

                      <div className="mt-2 flex justify-between text-xxs text-zinc-400 font-mono">
                        <span>Reported by: {inc.reportedBy}</span>
                        <span>{new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: SMART TAXI FARE & ROUTE PREDICTOR */}
        {activeTab === 'fare' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Input Config Form - 5 columns */}
            <div className="lg:col-span-12 xl:col-span-5 card space-y-6">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[#1A1C1E] flex items-center gap-2">
                  <Bus className="w-5 h-5 text-amber-500" />
                  Smart Taxi Fare Predictor
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                Taxi fares in Kampala spark dynamic price gouging. Estimate exact prices under current rain and rush hour levels instantly.
                </p>
              </div>

              <form onSubmit={handleFarePredictSubmit} className="space-y-4">
                
                {/* Route selector dropdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Starting Point</label>
                    <select
                      value={fareQuery.start}
                      onChange={(e) => setFareQuery(prev => ({ ...prev, start: e.target.value }))}
                      className="input-field text-xs cursor-pointer"
                    >
                      {KAMPALA_NODES.map(nod => (
                        <option key={nod.id} value={nod.id}>{nod.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Destination Stage</label>
                    <select
                      value={fareQuery.destination}
                      onChange={(e) => setFareQuery(prev => ({ ...prev, destination: e.target.value }))}
                      className="input-field text-xs cursor-pointer"
                    >
                      {KAMPALA_NODES.map(nod => (
                        <option key={nod.id} value={nod.id} disabled={nod.id === fareQuery.start}>{nod.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Weather Select Grid Option */}
                <div>
                  <label className="label">Current Weather Condition</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'Clear', label: '☀️ Clear Skies' },
                      { value: 'Rain', label: '🌧️ Light Rain' },
                      { value: 'Heavy Rain', label: '☔ Heavy Rain' }
                    ].map(cond => {
                      const selected = fareQuery.weather === cond.value;
                      return (
                        <button
                          key={cond.value}
                          type="button"
                          onClick={() => setFareQuery(p => ({ ...p, weather: cond.value as any }))}
                          className={`condition-pill ${selected ? 'pill-active' : ''}`}
                          style={{ margin: 0, justifyContent: 'center', width: '100%' }}
                        >
                          <span className="text-xs font-semibold whitespace-nowrap">{cond.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time of Day Select Grid Option */}
                <div>
                  <label className="label">Time & Flow Conditions</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'Off-Peak', label: '🌆 Off-Peak' },
                      { value: 'Morning Rush', label: '🌅 Morning Rush' },
                      { value: 'Evening Rush', label: '🌇 Evening Rush' }
                    ].map(cond => {
                      const selected = fareQuery.timeOfDay === cond.value;
                      return (
                        <button
                          key={cond.value}
                          type="button"
                          onClick={() => setFareQuery(p => ({ ...p, timeOfDay: cond.value as any }))}
                          className={`condition-pill ${selected ? 'pill-active' : ''}`}
                          style={{ margin: 0, justifyContent: 'center', width: '100%' }}
                        >
                          <span className="text-xs font-semibold whitespace-nowrap">{cond.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  id="predict-fare"
                  type="submit"
                  disabled={isSubmittingFare}
                  className="predict-btn w-full font-bold"
                  style={{ height: '52px', marginTop: '12px' }}
                >
                  {isSubmittingFare ? 'Analyzing Transit Matrix...' : 'Calculate Predicted Fare'}
                </button>

                {fareError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-800 rounded-xl text-xs font-medium">
                    {fareError}
                  </div>
                )}
              </form>
            </div>

            {/* Smart Output Panel - 7 columns */}
            <div className="lg:col-span-12 xl:col-span-7 card min-h-[460px] justify-between">
              
              {prediction ? (
                <div className="space-y-6">
                  <div className="border-b border-gray-150 pb-4 flex justify-between items-start">
                    <div>
                      <span className="text-xxs font-mono bg-yellow-100 text-yellow-850 px-2.5 py-1 rounded font-bold uppercase tracking-wider">Estimated Fare Prediction</span>
                      <h3 className="text-md font-bold mt-1.5 text-[#1A1C1E]">
                        From {KAMPALA_NODES.find(n => n.id === fareQuery.start)?.name} to {KAMPALA_NODES.find(n => n.id === fareQuery.destination)?.name}
                      </h3>
                    </div>
                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Dynamic predictions active
                    </span>
                  </div>

                  {/* Gigantic dynamic price block */}
                  <div className="prediction-hero">
                    <div className="fare-label">Predicted Fare Range</div>
                    <div className="fare-amount font-light">
                      UGX {prediction.predictedRange[0].toLocaleString()} – {prediction.predictedRange[1].toLocaleString()}
                    </div>
                    <div className="text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1.5 mt-2">
                      <span className="status-dot" style={{ backgroundColor: '#10B981' }} />
                      Expected Wait Time: 12-15 mins
                    </div>
                  </div>

                  {/* Breakdown detailed block style */}
                  <div className="space-y-1">
                    <h4 className="label mb-3">Dynamic Pricing Breakdown</h4>
                    
                    <div className="breakdown-item">
                      <span className="text-[#6B7280] font-medium text-xs">Standard Route Fare</span>
                      <span className="font-bold text-sm text-[#1A1C1E]">UGX {prediction.baseFare.toLocaleString()}</span>
                    </div>
                    
                    {prediction.multiplier > 1.0 && (
                      <div className="breakdown-item">
                        <span className="text-[#6B7280] font-medium text-xs">Weather Surcharge (x{prediction.multiplier})</span>
                        <span className="text-red-500 font-semibold text-sm">
                          + UGX {Math.round(prediction.baseFare * (prediction.multiplier - 1)).toLocaleString()}
                        </span>
                      </div>
                    )}

                    <div className="breakdown-item">
                      <span className="text-[#6B7280] font-medium text-xs">Peak Hour Adjustment</span>
                      <span className="text-red-500 font-semibold text-sm">
                        {fareQuery.timeOfDay !== 'Off-Peak' ? '+ UGX 1,000' : '+ UGX 0'}
                      </span>
                    </div>

                    <div className="breakdown-item" style={{ marginTop: '12px', borderTop: '2px solid #1A1C1E', paddingTop: '16px' }}>
                      <span className="font-bold text-[#1A1C1E] text-sm">Final Estimate</span>
                      <span className="font-bold text-[#1A1C1E] text-md">
                        UGX {prediction.predictedRange[1].toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Live Route Map with route-viz container from Design HTML */}
                  <div className="mt-8">
                    <label className="label">Optimal Boarding Points & Route Map</label>
                    <div className="route-viz h-32 w-full flex items-center justify-center relative text-slate-400 text-xs font-medium">
                      <span>[ Live Route Map for {KAMPALA_NODES.find(n => n.id === fareQuery.start)?.name} ➔ {KAMPALA_NODES.find(n => n.id === fareQuery.destination)?.name} ]</span>
                      <div className="map-marker" style={{ top: '35%', left: '25%' }} />
                      <div className="map-marker" style={{ top: '65%', left: '75%', backgroundColor: '#10B981', boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }} />
                    </div>
                    <div className="flex justify-between mt-3 text-[11px] text-[#6B7280]">
                      <div className="flex items-center">
                        <span className="status-dot" style={{ backgroundColor: '#FF4444' }} /> {KAMPALA_NODES.find(n => n.id === fareQuery.start)?.name} (Heavy queues)
                      </div>
                      <div className="flex items-center">
                        <span className="status-dot" style={{ backgroundColor: '#10B981' }} /> Transit Stage (Recommended)
                      </div>
                    </div>
                  </div>

                  {/* Stage detailed box info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xxs uppercase tracking-wider text-slate-400 font-bold block mb-0.5">Boarding Location / Stage</span>
                        <p className="text-xs font-bold text-slate-800">{prediction.bestStage}</p>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex items-start gap-3">
                      <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xxs uppercase tracking-wider text-slate-400 font-bold block mb-0.5">Route Multiplier Rate</span>
                        <p className="text-xs font-bold text-slate-800">
                          {prediction.multiplier > 1.0 ? `${prediction.multiplier}x multiplier applied due to weather` : 'Standard commuter index'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Detailed mathematical calculation explanation */}
                  <div className="p-4 bg-yellow-50/50 border border-yellow-100 rounded-xl space-y-1">
                    <h4 className="text-xs font-bold text-[#1A1C1E] uppercase tracking-wider">How was this fare calculated?</h4>
                    <p className="text-xs leading-relaxed text-[#1A1C1E]">{prediction.explanation}</p>
                  </div>

                  {/* Commuter Local tips bullet lists */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-[#1A1C1E] uppercase tracking-widest flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-[#FFD700]" /> Commuter Guidance & Strategy Tips
                    </h4>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 pl-1 leading-relaxed list-inside">
                      {prediction.localTips.map((tip, idx) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span className="text-emerald-500 font-bold font-mono">✓</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-20 text-slate-400">
                  <Bus className="w-12 h-12 text-slate-300 mb-3 animate-bounce" />
                  <p className="text-md font-semibold text-slate-800">Select route parameters and click predict.</p>
                  <p className="text-xs max-w-xs mt-1">Estimations take weather parameters, rush congestion indices, and dynamic driver policies into account.</p>
                </div>
              )}

              <div className="mt-8 pt-4 border-t border-gray-150 flex items-center justify-between text-xxs font-mono text-slate-400">
                <span>Kampala Public Transport Index (Update May 2026)</span>
                <span>Values estimated dynamically via Gemini-3.5 API</span>
              </div>

            </div>

          </div>
        )}

        {/* TAB 3: BODA-SAFETY BEHAVIOR REVIEW */}
        {activeTab === 'boda' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Passenger Feedback Submission Form Column - 5 columns */}
            <div className="lg:col-span-12 xl:col-span-5 card space-y-6">
              
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[#1A1C1E] flex items-center gap-2">
                  <Bike className="w-5 h-5 text-amber-500" />
                  Boda-Safety AI Reviews
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Help improve safety reputations on Kampala roads. Submit anonymous behavioral comments about your riders to aggregate danger metrics.
                </p>
              </div>

              {/* Review Preset templates */}
              <div>
                <label className="label">Preset Review Scenarios (Click to Fill)</label>
                <div className="flex flex-col gap-1.5">
                  {reviewTemplates.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setReviewText(tpl.text);
                        // Generate a plausible random plates
                        const plates = ["UFE 123X", "UFC 456Y", "UFD 999E", "UFB 321W"];
                        setRiderPlate(plates[i % plates.length]);
                      }}
                      className="text-xxs bg-slate-100 hover:bg-yellow-100 text-[#1A1C1E] rounded-lg p-2.5 transition-colors border border-slate-200 font-mono text-left cursor-pointer"
                    >
                      {tpl.label}: &ldquo;{tpl.text.substring(0, 50)}...&rdquo;
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleBodaSubmit} className="space-y-4">
                <div>
                  <label className="label">Rider Identification Plate Number</label>
                  <input
                    id="rider-plate-input"
                    type="text"
                    value={riderPlate}
                    onChange={(e) => setRiderPlate(e.target.value.toUpperCase())}
                    placeholder="e.g. UFE 123X"
                    maxLength={8}
                    className="input-field text-xs uppercase font-mono font-bold"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Standard Ugandan plates carry U-prefix followed by 3 letters and 3 numbers (e.g. UFC 456Y).</p>
                </div>

                <div>
                  <label className="label">Ride Experience (Detailed behavior description)</label>
                  <textarea
                    id="boda-review-input"
                    rows={4}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="e.g. Commutes without backup helmet, speeds down onto Makerere bypass lanes swerving under high speeds..."
                    className="input-field text-xs"
                    required
                  />
                </div>

                <button
                  id="submit-boda-review"
                  type="submit"
                  disabled={isSubmittingBoda || !riderPlate.trim() || !reviewText.trim()}
                  className="predict-btn w-full font-bold"
                  style={{ height: '52px' }}
                >
                  {isSubmittingBoda ? 'Classifying Behavior...' : 'Submit Safe / Risk Report'}
                </button>

                {bodaError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-800 rounded-xl text-xs font-medium">
                    {bodaError}
                  </div>
                )}
              </form>
            </div>

            {/* Dashboard Aggregation, Leaderboard, and Recent records panel - 7 columns */}
            <div className="lg:col-span-12 xl:col-span-7 space-y-6">
              
              {/* Aggregated Stats Header */}
              <div className="grid grid-cols-3 gap-4">
                {(() => {
                  const stats = bodaStats();
                  return (
                    <>
                      <div className="card text-center" style={{ padding: '16px' }}>
                        <span className="text-xxs font-mono text-slate-400 uppercase tracking-wider block mb-1">Safety Index Avg</span>
                        <div className="text-2xl font-extrabold text-slate-900 flex items-center justify-center gap-1">
                          <span className={`${stats.avgScore >= 7 ? 'text-emerald-600' : stats.avgScore >= 5 ? 'text-amber-500' : 'text-red-500'}`}>
                            {stats.avgScore}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">/ 10</span>
                        </div>
                      </div>
                      <div className="card text-center" style={{ padding: '16px' }}>
                        <span className="text-xxs font-mono text-slate-400 uppercase tracking-wider block mb-1">Logged Audits</span>
                        <div className="text-2xl font-extrabold text-slate-900">{stats.total}</div>
                      </div>
                      <div className="card text-center" style={{ padding: '16px' }}>
                        <span className="text-xxs font-mono text-slate-400 uppercase tracking-wider block mb-1">Crucial Alerts</span>
                        <div className="text-2xl font-extrabold text-red-600 animate-pulse">{stats.criticalCount}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Rider Leaderboard ranking stage */}
              <div className="card">
                <h3 className="text-md font-bold text-[#1A1C1E] mb-3 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  Self-regulating Stage Rep Leaderboard
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Aggregated ratings categorized by Boda license plate number. Helps Stage Chairmen monitor safe drivers vs reckless speeding alerts.
                </p>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {riderAggregation().map((grp, i) => {
                    const progressColor = grp.avgScore >= 7.5 ? 'bg-emerald-500' : grp.avgScore >= 5.0 ? 'bg-amber-500' : 'bg-red-500';
                    return (
                      <div key={grp.plate} className="flex items-center justify-between p-3 rounded-xl border border-slate-150 bg-slate-50 hover:bg-slate-100 transition-colors text-xs gap-4">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-400 text-xs font-bold w-4">#{i+1}</span>
                          <div className="bg-white border border-slate-300 rounded font-mono font-bold px-2 py-1 text-slate-800 tracking-wider shadow-xs uppercase">
                            {grp.plate}
                          </div>
                        </div>

                        {/* Middle progress ranking bar */}
                        <div className="flex-1 max-w-xs hidden sm:block">
                          <div className="flex justify-between font-mono text-[10px] text-slate-400 mb-1">
                            <span>Rating: <strong>{grp.avgScore}/10</strong></span>
                            <span>({grp.count} feed)</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className={`h-full ${progressColor}`} style={{ width: `${grp.avgScore * 10}%` }} />
                          </div>
                        </div>

                        {/* Badging alert indicators */}
                        <div className="text-right">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xxs font-semibold ${
                            grp.avgScore >= 7.5 ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                            grp.avgScore >= 5.0 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                            'bg-red-50 text-red-800 border border-red-100 font-bold animate-pulse'
                          }`}>
                            {grp.avgScore >= 7.5 ? 'Green Code Safe' : grp.avgScore >= 5.0 ? 'Caution Warning' : 'Critical Hazard'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Feed logs lists of review details */}
              <div className="card">
                <h3 className="text-md font-bold text-[#1A1C1E] mb-4 flex items-center justify-between">
                  <span>Logged Passenger Feed Reviews</span>
                  <span className="text-xxs font-mono bg-stone-100 border border-stone-200 text-stone-500 px-2 rounded py-0.5">Live Audited</span>
                </h3>

                <div className="space-y-4 max-h-[290px] overflow-y-auto pr-1">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 relative text-xs hover:bg-slate-100/50 transition-colors">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="bg-white border border-slate-300 text-xs font-mono font-bold px-1.5 py-0.5 rounded shadow-xxs uppercase">
                            {rev.riderPlate}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xxs font-semibold flex items-center gap-1 ${
                            rev.sentiment === 'Positive' ? 'bg-emerald-50 text-emerald-700' :
                            rev.sentiment === 'Negative' ? 'bg-red-50 text-red-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {rev.sentiment === 'Positive' ? <ThumbsUp className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {rev.incidentType}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xxs text-slate-400 font-mono">Safety:</span>
                          <strong className={`font-mono font-extrabold text-sm ${
                            rev.safetyScore >= 7 ? 'text-emerald-600' : rev.safetyScore >= 5 ? 'text-amber-500' : 'text-red-500'
                          }`}>
                            {rev.safetyScore}
                          </strong>
                          <span className="text-xxs text-slate-400 font-mono">/10</span>
                        </div>
                      </div>

                      <p className="text-slate-700 leading-relaxed italic pr-2">
                        &ldquo;{rev.reviewText}&rdquo;
                      </p>

                      <div className="mt-2 text-xxs text-slate-400 font-mono pt-1.5 border-t border-slate-100 flex justify-between">
                        <span>Passenger Report Ledger</span>
                        <span>{new Date(rev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Lightweight data-saving footer */}
      <footer className="bg-white border-t border-slate-200 mt-20 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-500">
          <p className="font-semibold text-xs text-slate-900 tracking-wide uppercase mb-2">Kampala Transit Smart Assistant</p>
          <p className="text-xs max-w-md mx-auto leading-relaxed">
            Designed as a high-performance, low-data mobile dashboard for Ugandan drivers and commuters. Powered by ITpath.
          </p>
          <div className="mt-4 flex justify-center gap-3 text-xxs font-mono">
            <span>© 2026 Transit Uganda Ltd.</span>
            <span>•</span>
            <span>Kampala,Uganda</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
