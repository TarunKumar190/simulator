import fs from 'fs';
import path from 'path';
import type { Machine, MachineStatus, MachineThresholds, MlModelMetrics, RiskCategory } from '../types.ts';

export interface TelemetrySample {
  tempRatio: number;
  vibRatio: number;
  pressHighRatio: number;
  pressLowDeficit: number;
  rpmRatio: number;
  loadRatio: number;
  peakExceedance: number;
  label: 0 | 1; // 0 = nominal, 1 = anomalous
  regime: string;
}

export interface TrainedAnomalyArtifact {
  modelName: string;
  version: string;
  trainedAt: string;
  featureNames: string[];
  normalMean: number[];
  normalStd: number[];
  logisticWeights: number[];
  logisticBias: number;
  metrics: MlModelMetrics;
}

const ARTIFACT_PATH = path.resolve(process.cwd(), 'src', 'ml', 'model_artifact.json');

let cachedArtifact: TrainedAnomalyArtifact | null = null;

export function extractNormalizedFeatures(
  reading: {
    temperature: number;
    vibration: number;
    pressure: number;
    rpm: number;
    load: number;
  },
  thresholds: MachineThresholds
): number[] {
  const tempRatio = reading.temperature / Math.max(1, thresholds.maxTemp);
  const vibRatio = reading.vibration / Math.max(0.1, thresholds.maxVibration);
  const pressHighRatio = reading.pressure / Math.max(1, thresholds.maxPressure);
  const pressLowDeficit = Math.max(
    0,
    (thresholds.minPressure - reading.pressure) / Math.max(1, thresholds.minPressure)
  );
  const rpmRatio = reading.rpm / Math.max(1, thresholds.maxRpm);
  const loadRatio = reading.load / Math.max(1, thresholds.maxLoad);
  const peakExceedance = Math.max(
    0,
    tempRatio - 1,
    vibRatio - 1,
    pressHighRatio - 1,
    pressLowDeficit,
    rpmRatio - 1,
    loadRatio - 1
  );

  return [
    tempRatio,
    vibRatio,
    pressHighRatio,
    pressLowDeficit,
    rpmRatio,
    loadRatio,
    peakExceedance,
  ];
}

function sigmoid(z: number): number {
  if (z > 35) return 1;
  if (z < -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

// Seeded PRNG for deterministic training & evaluation
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, std: number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

export function generateTelemetryDataset(totalSamples = 1500): TelemetrySample[] {
  const rng = mulberry32(20261126);
  const samples: TelemetrySample[] = [];

  for (let i = 0; i < totalSamples; i++) {
    const roll = rng();
    let tempRatio = gaussian(rng, 0.72, 0.08);
    let vibRatio = gaussian(rng, 0.48, 0.11);
    let pressHighRatio = gaussian(rng, 0.78, 0.07);
    let pressLowDeficit = Math.max(0, gaussian(rng, 0.0, 0.02));
    let rpmRatio = gaussian(rng, 0.74, 0.09);
    let loadRatio = gaussian(rng, 0.72, 0.09);
    let label: 0 | 1 = 0;
    let regime = 'Normal';

    if (roll < 0.58) {
      // Nominal operating band with natural process noise
      label = 0;
      regime = 'Normal';
    } else if (roll < 0.68) {
      // High-load nominal borderline (tests false-positive resistance)
      tempRatio = gaussian(rng, 0.93, 0.045);
      vibRatio = gaussian(rng, 0.88, 0.06);
      loadRatio = gaussian(rng, 0.92, 0.04);
      label = 0;
      regime = 'PeakNominal';
    } else if (roll < 0.77) {
      // Thermal drift fault
      tempRatio = gaussian(rng, 1.11, 0.07);
      vibRatio = gaussian(rng, 0.65, 0.12);
      label = 1;
      regime = 'ThermalDrift';
    } else if (roll < 0.86) {
      // Bearing / spindle vibration fault
      vibRatio = gaussian(rng, 1.38, 0.19);
      tempRatio = gaussian(rng, 0.88, 0.08);
      label = 1;
      regime = 'BearingVibration';
    } else if (roll < 0.93) {
      // Overpressure or pressure drop fault
      if (rng() > 0.35) {
        pressHighRatio = gaussian(rng, 1.16, 0.08);
      } else {
        pressHighRatio = gaussian(rng, 0.42, 0.08);
        pressLowDeficit = gaussian(rng, 0.25, 0.08);
      }
      label = 1;
      regime = 'PressureAnomaly';
    } else {
      // Compound overload / multi-fault
      tempRatio = gaussian(rng, 1.14, 0.09);
      vibRatio = gaussian(rng, 1.35, 0.22);
      pressHighRatio = gaussian(rng, 1.14, 0.09);
      loadRatio = gaussian(rng, 1.09, 0.05);
      label = 1;
      regime = 'CompoundOverload';
    }

    tempRatio = Math.max(0.2, Number(tempRatio.toFixed(4)));
    vibRatio = Math.max(0.05, Number(vibRatio.toFixed(4)));
    pressHighRatio = Math.max(0.1, Number(pressHighRatio.toFixed(4)));
    pressLowDeficit = Math.max(0, Number(pressLowDeficit.toFixed(4)));
    rpmRatio = Math.max(0, Number(rpmRatio.toFixed(4)));
    loadRatio = Math.max(0, Number(loadRatio.toFixed(4)));
    const peakExceedance = Number(
      Math.max(
        0,
        tempRatio - 1,
        vibRatio - 1,
        pressHighRatio - 1,
        pressLowDeficit,
        rpmRatio - 1,
        loadRatio - 1
      ).toFixed(4)
    );

    samples.push({
      tempRatio,
      vibRatio,
      pressHighRatio,
      pressLowDeficit,
      rpmRatio,
      loadRatio,
      peakExceedance,
      label,
      regime,
    });
  }

  return samples;
}

function sampleToVector(s: TelemetrySample): number[] {
  return [
    s.tempRatio,
    s.vibRatio,
    s.pressHighRatio,
    s.pressLowDeficit,
    s.rpmRatio,
    s.loadRatio,
    s.peakExceedance,
  ];
}

function computeRocAuc(scores: number[], labels: (0 | 1)[]): number {
  const pairs = scores.map((score, i) => ({ score, label: labels[i] }));
  pairs.sort((a, b) => b.score - a.score);
  const posCount = labels.filter((l) => l === 1).length;
  const negCount = labels.length - posCount;
  if (posCount === 0 || negCount === 0) return 0.5;

  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let auc = 0;

  for (const p of pairs) {
    if (p.label === 1) tp += 1;
    else fp += 1;
    auc += ((fp - prevFp) * (tp + prevTp)) / 2;
    prevTp = tp;
    prevFp = fp;
  }
  return Number((auc / (posCount * negCount)).toFixed(4));
}

export function trainAnomalyPipeline(dataset?: TelemetrySample[]): {
  artifact: TrainedAnomalyArtifact;
  dataset: TelemetrySample[];
} {
  const fullData = dataset || generateTelemetryDataset(1500);
  const splitIdx = Math.floor(fullData.length * 0.8);
  const trainSet = fullData.slice(0, splitIdx);
  const testSet = fullData.slice(splitIdx);

  const featureCount = 7;
  const normalTrain = trainSet.filter((s) => s.label === 0);

  // 1. Fit standardization stats on normal operating data
  const normalMean = new Array<number>(featureCount).fill(0);
  for (const s of normalTrain) {
    const v = sampleToVector(s);
    for (let j = 0; j < featureCount; j++) normalMean[j] += v[j];
  }
  for (let j = 0; j < featureCount; j++) normalMean[j] /= Math.max(1, normalTrain.length);

  const normalStd = new Array<number>(featureCount).fill(0);
  for (const s of normalTrain) {
    const v = sampleToVector(s);
    for (let j = 0; j < featureCount; j++) {
      normalStd[j] += (v[j] - normalMean[j]) ** 2;
    }
  }
  for (let j = 0; j < featureCount; j++) {
    normalStd[j] = Math.max(0.05, Math.sqrt(normalStd[j] / Math.max(1, normalTrain.length)));
  }

  // 2. Train L2-regularized Logistic Anomaly Classifier via gradient descent
  const weights = new Array<number>(featureCount).fill(0);
  let bias = -1.2;
  const lr = 0.18;
  const l2 = 0.005;
  const epochs = 450;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array<number>(featureCount).fill(0);
    let gradB = 0;

    for (const s of trainSet) {
      const v = sampleToVector(s);
      const zVec = v.map((val, j) => (val - normalMean[j]) / normalStd[j]);
      let z = bias;
      for (let j = 0; j < featureCount; j++) z += weights[j] * zVec[j];
      const pred = sigmoid(z);
      const err = pred - s.label;
      gradB += err;
      for (let j = 0; j < featureCount; j++) {
        gradW[j] += err * zVec[j];
      }
    }

    const n = trainSet.length;
    bias -= (lr * gradB) / n;
    for (let j = 0; j < featureCount; j++) {
      weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
    }
  }

  // 3. Evaluate on held-out test set
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  const testScores: number[] = [];
  const testLabels: (0 | 1)[] = [];

  for (const s of testSet) {
    const v = sampleToVector(s);
    const score = scoreVectorWithParams(v, normalMean, normalStd, weights, bias);
    testScores.push(score);
    testLabels.push(s.label);
    const predLabel = score >= 0.5 ? 1 : 0;
    if (predLabel === 1 && s.label === 1) tp++;
    else if (predLabel === 1 && s.label === 0) fp++;
    else if (predLabel === 0 && s.label === 0) tn++;
    else fn++;
  }

  const total = Math.max(1, testSet.length);
  const accuracy = Number(((tp + tn) / total).toFixed(4));
  const precision = Number((tp / Math.max(1, tp + fp)).toFixed(4));
  const recall = Number((tp / Math.max(1, tp + fn)).toFixed(4));
  const f1Score = Number(
    ((2 * precision * recall) / Math.max(1e-6, precision + recall)).toFixed(4)
  );
  const rocAuc = computeRocAuc(testScores, testLabels);

  const trainedAt = new Date().toISOString();
  const artifact: TrainedAnomalyArtifact = {
    modelName: 'ForgeTwin Standardized Mahalanobis + Logistic Anomaly Classifier',
    version: '1.0.0',
    trainedAt,
    featureNames: [
      'tempRatio',
      'vibRatio',
      'pressHighRatio',
      'pressLowDeficit',
      'rpmRatio',
      'loadRatio',
      'peakExceedance',
    ],
    normalMean: normalMean.map((x) => Number(x.toFixed(5))),
    normalStd: normalStd.map((x) => Number(x.toFixed(5))),
    logisticWeights: weights.map((x) => Number(x.toFixed(5))),
    logisticBias: Number(bias.toFixed(5)),
    metrics: {
      modelName: 'Standardized Mahalanobis + Logistic Classifier',
      version: '1.0.0',
      trainedAt,
      trainingSamples: trainSet.length,
      testSamples: testSet.length,
      accuracy,
      precision,
      recall,
      f1Score,
      rocAuc,
      confusionMatrix: { tp, fp, tn, fn },
    },
  };

  return { artifact, dataset: fullData };
}

function scoreVectorWithParams(
  v: number[],
  normalMean: number[],
  normalStd: number[],
  weights: number[],
  bias: number
): number {
  let sqDist = 0;
  let z = bias;
  for (let j = 0; j < v.length; j++) {
    const zVal = (v[j] - normalMean[j]) / normalStd[j];
    z += weights[j] * zVal;
    sqDist += zVal * zVal;
  }
  const logisticProb = sigmoid(z);
  const rmsZ = Math.sqrt(sqDist / v.length);
  // Blend logistic probability with bounded standardized RMS deviation
  const distScore = 1 - Math.exp(-Math.max(0, rmsZ - 0.9) * 0.45);
  const blended = 0.72 * logisticProb + 0.28 * distScore;
  return Number(Math.min(0.99, Math.max(0.01, blended)).toFixed(2));
}

export function loadAnomalyArtifact(): TrainedAnomalyArtifact {
  if (cachedArtifact) return cachedArtifact;
  if (fs.existsSync(ARTIFACT_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8')) as TrainedAnomalyArtifact;
      cachedArtifact = parsed;
      return parsed;
    } catch {
      // fall through to re-train
    }
  }
  const { artifact } = trainAnomalyPipeline();
  cachedArtifact = artifact;
  return artifact;
}

export function evaluateMachineTelemetryML(machine: Machine): {
  status: MachineStatus;
  anomalyScore: number;
  riskCategory: RiskCategory;
  healthScore: number;
  abnormalParameters: string[];
  flaggedReason: string;
  modelVersion: string;
} {
  const t = machine.thresholds;
  const artifact = loadAnomalyArtifact();
  const abnormal: string[] = [];
  const reasons: string[] = [];

  if (
    machine.scenario === 'Sudden Shutdown' ||
    (machine.rpm === 0 && machine.load === 0 && machine.status === 'offline')
  ) {
    return {
      status: 'offline',
      anomalyScore: 0.94,
      riskCategory: 'Critical',
      healthScore: Math.min(machine.healthScore, 30),
      abnormalParameters: ['RPM', 'Load', 'Power State'],
      flaggedReason: 'Unexpected zero-RPM stoppage detected while shift schedule is active.',
      modelVersion: artifact.version,
    };
  }

  if (machine.temperature > t.maxTemp) {
    abnormal.push('Temperature');
    reasons.push(`temperature (${machine.temperature.toFixed(1)} °C) is above the ${t.maxTemp} °C threshold`);
  }
  if (machine.vibration > t.maxVibration) {
    abnormal.push('Vibration');
    reasons.push(`vibration (${machine.vibration.toFixed(2)} mm/s) exceeds the ${t.maxVibration} mm/s operating limit`);
  }
  if (machine.pressure > t.maxPressure || machine.pressure < t.minPressure) {
    abnormal.push('Pressure');
    reasons.push(
      machine.pressure > t.maxPressure
        ? `pressure (${machine.pressure.toFixed(1)} bar) exceeds the ${t.maxPressure} bar ceiling`
        : `pressure (${machine.pressure.toFixed(1)} bar) dropped below ${t.minPressure} bar minimum`
    );
  }
  if (machine.rpm > t.maxRpm) {
    abnormal.push('RPM');
    reasons.push(`rotational speed (${machine.rpm} RPM) exceeds ${t.maxRpm} RPM rating`);
  }
  if (machine.load > t.maxLoad) {
    abnormal.push('Load');
    reasons.push(`motor load (${machine.load.toFixed(1)}%) exceeds ${t.maxLoad}% continuous limit`);
  }

  const features = extractNormalizedFeatures(machine, t);
  let anomalyScore = scoreVectorWithParams(
    features,
    artifact.normalMean,
    artifact.normalStd,
    artifact.logisticWeights,
    artifact.logisticBias
  );

  // Calibrate floor when threshold breaches occur so single-axis spikes are surfaced reliably
  if (abnormal.length === 1 && anomalyScore < 0.56) {
    anomalyScore = 0.58;
  } else if (abnormal.length >= 2 && anomalyScore < 0.78) {
    anomalyScore = 0.81;
  }

  let status: MachineStatus;
  let riskCategory: RiskCategory;
  let flaggedReason: string;
  let healthScore: number;

  if (abnormal.length === 0 && anomalyScore < 0.5) {
    status = 'running';
    riskCategory = anomalyScore > 0.25 ? 'Low Risk' : 'Normal';
    flaggedReason = 'All telemetry parameters remain within configured operating thresholds.';
    healthScore = Math.min(99, Math.max(82, Math.round(98 - anomalyScore * 22)));
  } else if (
    anomalyScore >= 0.75 ||
    abnormal.length >= 2 ||
    machine.vibration > t.maxVibration * 1.45
  ) {
    status = 'critical';
    riskCategory = 'Critical';
    flaggedReason =
      reasons.length > 0
        ? `Flagged because ${reasons.join(' and ')}.`
        : 'Multivariate telemetry deviation exceeded critical envelope.';
    healthScore = Math.max(20, Math.round(90 - anomalyScore * 55));
  } else {
    status = 'warning';
    riskCategory = anomalyScore >= 0.6 ? 'High Risk' : 'Medium Risk';
    flaggedReason =
      reasons.length > 0
        ? `Flagged because ${reasons.join(' and ')}.`
        : 'Elevated multivariate anomaly score detected relative to baseline distribution.';
    healthScore = Math.max(46, Math.round(92 - anomalyScore * 42));
  }

  return {
    status,
    anomalyScore,
    riskCategory,
    healthScore,
    abnormalParameters: abnormal,
    flaggedReason,
    modelVersion: artifact.version,
  };
}
