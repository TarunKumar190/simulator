import fs from 'fs';
import path from 'path';
import { generateTelemetryDataset, trainAnomalyPipeline } from './anomalyModel.ts';

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dataset = generateTelemetryDataset(1500);
const datasetPath = path.resolve(dataDir, 'telemetry_benchmark.json');
fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));

const { artifact } = trainAnomalyPipeline(dataset);
const artifactPath = path.resolve(process.cwd(), 'src', 'ml', 'model_artifact.json');
fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));

console.log('Trained ForgeTwin ML anomaly model:', artifact.modelName);
console.log('Held-out Test Metrics:', JSON.stringify(artifact.metrics, null, 2));
