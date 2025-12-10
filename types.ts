import { Vector3 } from 'three';

export interface PositionData {
  chaos: [number, number, number];
  target: [number, number, number];
}

export interface OrnamentData {
  positionChaos: Vector3;
  positionTarget: Vector3;
  color: string;
  type: 'sphere' | 'box';
  scale: number;
  speed: number; // For different physical weights
  rotationSpeed: number;
}

export type TreeState = 'CHAOS' | 'FORMED';

export interface AppConfig {
  particleSize: number;
  rotationSpeed: number;
  ornamentScale: number;
  photoScale: number;
  ornamentCount: number;
  musicUrl: string;
  showSnow: boolean;
  snowCount: number;
  snowSize: number;
}

export interface PhotoData {
  id: string;
  url: string;
  positionChaos: Vector3;
  positionTarget: Vector3;
  timestamp: number;
}

export const COLORS = {
  EMERALD: '#043927',
  DEEP_GREEN: '#002415',
  GOLD: '#D4AF37',
  GOLD_HIGHLIGHT: '#FFF6D6',
  RED_VELVET: '#660015',
  WARM_LIGHT: '#ffaa33',
};