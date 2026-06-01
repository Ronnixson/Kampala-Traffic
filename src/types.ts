export interface TrafficIncident {
  id: string;
  location: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  cause: string;
  alternativeRouteSuggested: boolean;
  alternativeRouteDetails?: string;
  rawInput: string;
  language: 'English' | 'Luganda' | 'Mix';
  timestamp: string;
  reportedBy: string;
}

export interface FareQuery {
  start: string;
  destination: string;
  weather: 'Clear' | 'Rain' | 'Heavy Rain';
  timeOfDay: 'Morning Rush' | 'Evening Rush' | 'Off-Peak';
}

export interface FarePredictionResult {
  baseFare: number;
  predictedRange: [number, number];
  multiplier: number;
  timeBonus: number;
  explanation: string;
  bestStage: string;
  localTips: string[];
}

export interface BodaReview {
  id: string;
  riderPlate: string;
  incidentType: 'Reckless Overtaking' | 'No Helmet' | 'Severe Speeding' | 'Safe Ride' | 'Overloading' | 'Polite Assistant';
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  reviewText: string;
  safetyScore: number; // 0 to 10
  timestamp: string;
}

export interface KampalaNode {
  id: string;
  name: string;
  coordinates: { x: number; y: number }; // Percentage coordinate for canvas map sizing
  connections: string[]; // Adjacent nodes
}
