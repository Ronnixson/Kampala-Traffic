import { KampalaNode, TrafficIncident, BodaReview } from './types';

export const KAMPALA_NODES: KampalaNode[] = [
  { id: 'old_park', name: 'Old Taxi Park (Central)', coordinates: { x: 45, y: 65 }, connections: ['wandegeya', 'jinja_road', 'ggaba'] },
  { id: 'wandegeya', name: 'Wandegeya / Makerere', coordinates: { x: 35, y: 40 }, connections: ['old_park', 'kawempe', 'ntinda'] },
  { id: 'kawempe', name: 'Kawempe', coordinates: { x: 20, y: 15 }, connections: ['wandegeya'] },
  { id: 'jinja_road', name: 'Jinja Road / Nakawa', coordinates: { x: 65, y: 55 }, connections: ['old_park', 'ntinda', 'bweyogerere', 'bugolobi'] },
  { id: 'ntinda', name: 'Ntinda Corner', coordinates: { x: 55, y: 30 }, connections: ['wandegeya', 'jinja_road', 'gayaza'] },
  { id: 'gayaza', name: 'Gayaza', coordinates: { x: 50, y: 10 }, connections: ['ntinda'] },
  { id: 'bweyogerere', name: 'Bweyogerere', coordinates: { x: 80, y: 45 }, connections: ['jinja_road', 'seeta'] },
  { id: 'seeta', name: 'Seeta / Mukono', coordinates: { x: 95, y: 35 }, connections: ['bweyogerere'] },
  { id: 'ggaba', name: 'Ggaba Road', coordinates: { x: 60, y: 85 }, connections: ['old_park'] },
  { id: 'bugolobi', name: 'Bugolobi', coordinates: { x: 72, y: 65 }, connections: ['jinja_road', 'kitintale'] },
  { id: 'kitintale', name: 'Kitintale', coordinates: { x: 82, y: 72 }, connections: ['bugolobi'] },
];

export const INITIAL_TRAFFIC_INCIDENTS: TrafficIncident[] = [
  {
    id: '1',
    location: 'Seeta',
    severity: 'High',
    cause: 'Broken down trailer climbing Seeta Hill',
    alternativeRouteSuggested: true,
    alternativeRouteDetails: 'Bypass through Bukerere road back onto Jinja Road after Seeta Town.',
    rawInput: 'Webale, traffic engezeeko e Seeta, a trailer has broken down',
    language: 'Mix',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
    reportedBy: 'Bodaboda Chairman Alex',
  },
  {
    id: '2',
    location: 'Wandegeya',
    severity: 'Medium',
    cause: 'Traffic police manual diversion at Makerere Roundabout',
    alternativeRouteSuggested: true,
    alternativeRouteDetails: 'Use Sir Apollo Kaggwa road to bypass the roundabout congestion.',
    rawInput: 'Police are turning cars around at Wandegeya roundy towards Makerere Hill road, long line forms!',
    language: 'English',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
    reportedBy: 'Kamunye Driver Rogers',
  },
  {
    id: '3',
    location: 'Jinja Road',
    severity: 'Critical',
    cause: 'Minor accident right in front of Nakawa Market blocking 2 lanes',
    alternativeRouteSuggested: false,
    rawInput: 'Egwanidde! Mutuga ku Jinja Road e Nakawa, motoka bbiri zitomereganye wakati mu kkubo.',
    language: 'Luganda',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
    reportedBy: 'Moses B.',
  }
];

export const INITIAL_BODA_REVIEWS: BodaReview[] = [
  {
    id: 'b1',
    riderPlate: 'UFE 123X',
    incidentType: 'Severe Speeding',
    sentiment: 'Negative',
    reviewText: 'No helmet for rider and passenger, overspeeding on Northern Bypass. Overtook on left of a heavy truck, very scary experience!',
    safetyScore: 2,
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: 'b2',
    riderPlate: 'UFC 456Y',
    incidentType: 'Safe Ride',
    sentiment: 'Positive',
    reviewText: 'Webale nnyo, very slow and polite. Kept his helmet on and rode carefully around Ntinda traffic. Clean bike.',
    safetyScore: 10,
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: 'b3',
    riderPlate: 'UFD 789Z',
    incidentType: 'Reckless Overtaking',
    sentiment: 'Negative',
    reviewText: 'Constant swerving between Taxis at the Nakawa junction. He completely ignored my plea to slow down or drive straight.',
    safetyScore: 3,
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  }
];
