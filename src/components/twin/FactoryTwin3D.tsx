import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Eye, Layers, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { Machine, MachineStatus } from '../../types';

const STATUS_HEX: Record<MachineStatus, number> = {
  running: 0x16836b,
  warning: 0xd99a25,
  critical: 0xc74747,
  offline: 0x7b8794,
};

const STATUS_CSS: Record<MachineStatus, string> = {
  running: '#16836B',
  warning: '#D99A25',
  critical: '#C74747',
  offline: '#7B8794',
};

interface MachineRig {
  group: THREE.Group;
  basePos: THREE.Vector3;
  beaconMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
  movingPart?: THREE.Object3D;
  secondaryPart?: THREE.Object3D;
  modelType: Machine['modelType'];
}

function createFactoryFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Epoxy industrial floor base
  ctx.fillStyle = '#dde4ec';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle tile grid
  ctx.strokeStyle = '#cbd4df';
  ctx.lineWidth = 2;
  const step = 64;
  for (let i = 0; i <= 1024; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  // Yellow safety walkway borders
  ctx.strokeStyle = '#d99a25';
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 12]);
  ctx.strokeRect(48, 48, 928, 928);
  ctx.setLineDash([]);

  // Center aisle dashed line
  ctx.strokeStyle = '#9aa8b8';
  ctx.lineWidth = 4;
  ctx.setLineDash([24, 16]);
  ctx.beginPath();
  ctx.moveTo(48, 512);
  ctx.lineTo(976, 512);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadow(radius: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(23, 43, 77, 0.42)');
  grad.addColorStop(0.65, 'rgba(23, 43, 77, 0.14)');
  grad.addColorStop(1, 'rgba(23, 43, 77, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.015;
  return mesh;
}

function buildCompositeMachine(machine: Machine): MachineRig {
  const group = new THREE.Group();
  group.name = machine.id;
  const basePos = new THREE.Vector3(machine.position3D[0], 0, machine.position3D[2]);
  group.position.copy(basePos);

  const navyPaint = new THREE.MeshStandardMaterial({
    color: 0x1f3557,
    roughness: 0.42,
    metalness: 0.35,
  });
  const lightSteel = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.3,
    metalness: 0.72,
  });
  const darkIron = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.65,
    metalness: 0.45,
  });
  const brushedChrome = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.16,
    metalness: 0.92,
  });
  const safetyOrange = new THREE.MeshStandardMaterial({
    color: 0xd97736,
    roughness: 0.45,
    metalness: 0.2,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x93c5fd,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });

  const statusHex = STATUS_HEX[machine.status];
  const beaconMat = new THREE.MeshStandardMaterial({
    color: statusHex,
    emissive: statusHex,
    emissiveIntensity: 0.95,
    roughness: 0.25,
    metalness: 0.1,
  });

  // Floor status selection ring
  const ringGeo = new THREE.RingGeometry(2.15, 2.38, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: statusHex,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.03;
  group.add(ring);

  // Contact shadow
  group.add(createContactShadow(2.4));

  let movingPart: THREE.Object3D | undefined;
  let secondaryPart: THREE.Object3D | undefined;
  let beaconY = 3.2;

  if (machine.modelType === 'cnc') {
    // 1. Heavy cast base bed
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 2.4), darkIron);
    base.position.y = 0.275;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // 2. Enclosure cabinet
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.85, 2.0), lightSteel);
    cab.position.set(-0.1, 1.475, 0);
    cab.castShadow = true;
    group.add(cab);

    // 3. Viewing window
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.08), glassMat);
    win.position.set(-0.2, 1.55, 1.01);
    group.add(win);

    // 4. Vertical column & roof
    const crown = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.28, 2.1), navyPaint);
    crown.position.set(-0.1, 2.54, 0);
    crown.castShadow = true;
    group.add(crown);

    // 5. Rotating Spindle assembly
    const spindleGroup = new THREE.Group();
    spindleGroup.position.set(-0.2, 1.65, 0.1);
    const spindleHead = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.65, 16), brushedChrome);
    const cutter = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.45, 12), safetyOrange);
    cutter.position.y = -0.5;
    spindleGroup.add(spindleHead, cutter);
    group.add(spindleGroup);
    movingPart = spindleGroup;

    // 6. Side control pendant
    const pendantArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), darkIron);
    pendantArm.position.set(1.45, 1.5, 0.65);
    const pendantScreen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.22), navyPaint);
    pendantScreen.position.set(1.55, 1.65, 0.8);
    group.add(pendantArm, pendantScreen);
    beaconY = 2.95;
  } else if (machine.modelType === 'compressor') {
    // 1. Skid frame
    const skid = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.25, 1.9), darkIron);
    skid.position.y = 0.125;
    skid.castShadow = true;
    group.add(skid);

    // 2. Horizontal cylindrical pressure tank
    const tankGeo = new THREE.CylinderGeometry(0.68, 0.68, 2.4, 24);
    tankGeo.rotateZ(Math.PI / 2);
    const tank = new THREE.Mesh(tankGeo, navyPaint);
    tank.position.set(0, 0.95, 0.15);
    tank.castShadow = true;
    group.add(tank);

    // 3. Tank domed end caps
    for (const dir of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.68, 18, 14), navyPaint);
      cap.scale.set(0.55, 1, 1);
      cap.position.set(dir * 1.2, 0.95, 0.15);
      group.add(cap);
    }

    // 4. Dual compression motor block
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.9, 0.85), lightSteel);
    block.position.set(-0.45, 2.0, -0.15);
    block.castShadow = true;
    group.add(block);

    // 5. Rotating flywheel pulley
    const flywheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.14, 20);
    flywheelGeo.rotateX(Math.PI / 2);
    const flywheel = new THREE.Mesh(flywheelGeo, brushedChrome);
    flywheel.position.set(0.45, 2.0, 0.35);
    group.add(flywheel);
    movingPart = flywheel;

    // 6. Exhaust manifold pipe
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12), safetyOrange);
    pipe.position.set(-1.05, 2.25, -0.2);
    group.add(pipe);
    beaconY = 2.8;
  } else if (machine.modelType === 'conveyor') {
    // 1. Structural leg pairs
    for (const lx of [-1.4, 0, 1.4]) {
      for (const lz of [-0.65, 0.65]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), darkIron);
        leg.position.set(lx, 0.5, lz);
        leg.castShadow = true;
        group.add(leg);
      }
    }

    // 2. Side rails
    for (const rz of [-0.72, 0.72]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.28, 0.1), navyPaint);
      rail.position.set(0, 1.1, rz);
      rail.castShadow = true;
      group.add(rail);
    }

    // 3. Belt surface
    const belt = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 1.32), darkIron);
    belt.position.set(0, 1.06, 0);
    belt.receiveShadow = true;
    group.add(belt);

    // 4. Drive motor housing
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 16), safetyOrange);
    motor.rotation.x = Math.PI / 2;
    motor.position.set(1.4, 0.9, 1.02);
    group.add(motor);

    // 5. Moving product totes
    const toteGroup = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const tote = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.65), lightSteel);
      tote.position.set(i * 1.1, 1.3, 0);
      tote.castShadow = true;
      toteGroup.add(tote);
    }
    group.add(toteGroup);
    movingPart = toteGroup;
    beaconY = 2.2;
  } else if (machine.modelType === 'press') {
    // 1. Heavy bolster bed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.65, 2.2), darkIron);
    bed.position.y = 0.325;
    bed.castShadow = true;
    group.add(bed);

    // 2. Twin H-frame uprights
    for (const ux of [-1.05, 1.05]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.48, 2.6, 1.5), navyPaint);
      col.position.set(ux, 1.95, 0);
      col.castShadow = true;
      group.add(col);
    }

    // 3. Upper crown & hydraulic tank
    const crown = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.6, 1.7), navyPaint);
    crown.position.y = 3.25;
    crown.castShadow = true;
    group.add(crown);

    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.85, 18), lightSteel);
    cyl.position.y = 3.8;
    group.add(cyl);

    // 4. Reciprocating hydraulic ram + die platen
    const ramGroup = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 16), brushedChrome);
    rod.position.y = 2.4;
    const platen = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 1.3), safetyOrange);
    platen.position.y = 1.85;
    platen.castShadow = true;
    ramGroup.add(rod, platen);
    group.add(ramGroup);
    movingPart = ramGroup;

    // 5. Lower die block
    const die = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 1.2), lightSteel);
    die.position.y = 0.79;
    group.add(die);
    beaconY = 4.35;
  } else {
    // Packaging machine
    // 1. Stainless frame base
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.9, 1.8), lightSteel);
    base.position.y = 0.45;
    base.castShadow = true;
    group.add(base);

    // 2. Gantry uprights
    for (const gx of [-0.7, 0.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), navyPaint);
      post.position.set(gx, 1.65, -0.65);
      group.add(post);
      const postF = post.clone();
      postF.position.z = 0.65;
      group.add(postF);
    }

    // 3. Film roll cylinder
    const filmGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.2, 18);
    filmGeo.rotateX(Math.PI / 2);
    const film = new THREE.Mesh(filmGeo, brushedChrome);
    film.position.set(0, 2.1, 0);
    group.add(film);
    secondaryPart = film;

    // 4. Sealing jaw gantry
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 1.2), safetyOrange);
    jaw.position.set(0.25, 1.35, 0);
    group.add(jaw);
    movingPart = jaw;

    // 5. Discharge chute
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 1.1), darkIron);
    chute.rotation.z = -0.22;
    chute.position.set(1.55, 0.72, 0);
    group.add(chute);
    beaconY = 2.7;
  }

  // Overhead status tower light
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 10), darkIron);
  pole.position.set(0.9, beaconY - 0.2, -0.6);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 16), beaconMat);
  beacon.position.set(0.9, beaconY + 0.12, -0.6);
  group.add(pole, beacon);

  // Invisible simplified proxy collision mesh for reliable raycasting
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, beaconY + 0.6, 2.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.position.y = (beaconY + 0.6) / 2;
  proxy.userData.machineId = machine.id;
  proxy.layers.set(1);
  group.add(proxy);

  return {
    group,
    basePos,
    beaconMat,
    ringMat,
    movingPart,
    secondaryPart,
    modelType: machine.modelType,
  };
}

export function FactoryTwin3D({
  machines,
  selectedMachineId,
  onSelectMachine,
  force2DFallback = false,
}: {
  machines: Machine[];
  selectedMachineId: string;
  onSelectMachine: (machineId: string) => void;
  force2DFallback?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const machinesRef = useRef<Machine[]>(machines);
  const selectedIdRef = useRef<string>(selectedMachineId);
  const onSelectRef = useRef(onSelectMachine);
  const rigsRef = useRef<Map<string, MachineRig>>(new Map());
  const cameraPresetRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(14, 11.5, 15.5),
    target: new THREE.Vector3(0, 1.0, 0),
  });

  const [webglError, setWebglError] = useState(false);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(force2DFallback ? '2d' : '3d');
  const [activePreset, setActivePreset] = useState<'iso' | 'top' | 'focus'>('iso');
  const [controlsCollapsed, setControlsCollapsed] = useState(false);

  machinesRef.current = machines;
  selectedIdRef.current = selectedMachineId;
  onSelectRef.current = onSelectMachine;

  // Update machine rig status colors immediately when props change
  useEffect(() => {
    for (const m of machines) {
      const rig = rigsRef.current.get(m.id);
      if (!rig) continue;
      const hex = STATUS_HEX[m.status];
      rig.beaconMat.color.setHex(hex);
      rig.beaconMat.emissive.setHex(hex);
      rig.ringMat.color.setHex(hex);
      rig.ringMat.opacity = m.id === selectedMachineId ? 1.0 : 0.72;
    }
  }, [machines, selectedMachineId]);

  const applyCameraPreset = (preset: 'iso' | 'top' | 'focus') => {
    setActivePreset(preset);
    const cam = cameraPresetRef.current;
    if (preset === 'iso') {
      cam.pos.set(14, 11.5, 15.5);
      cam.target.set(0, 1.0, 0);
    } else if (preset === 'top') {
      cam.pos.set(0.01, 22, 0.01);
      cam.target.set(0, 0, 0);
    } else {
      const m = machinesRef.current.find((item) => item.id === selectedIdRef.current);
      if (m) {
        const [mx, , mz] = m.position3D;
        cam.pos.set(mx + 6.2, 5.2, mz + 6.8);
        cam.target.set(mx, 1.4, mz);
      }
    }
    cam.active = true;
  };

  useEffect(() => {
    if (viewMode === '2d' || force2DFallback) return;
    const container = mountRef.current;
    if (!container) return;

    // Software WebGL guard
    let isSoftwareGl = false;
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) {
        setWebglError(true);
        return;
      }
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      setWebglError(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeaf0f6);
    scene.fog = new THREE.Fog(0xeaf0f6, 26, 60);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 120);
    camera.position.set(14, 11.5, 15.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.minDistance = 6;
    controls.maxDistance = 36;
    controls.target.set(0, 1.0, 0);
    controls.addEventListener('start', () => {
      cameraPresetRef.current.active = false;
    });

    // Warm/cool 3-point industrial lighting
    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x94a3b8, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.45);
    keyLight.position.set(14, 22, 12);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 55;
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -16;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc7dcf7, 0.65);
    rimLight.position.set(-14, 12, -14);
    scene.add(rimLight);

    // Factory floor plane
    const floorTex = createFactoryFloorTexture(renderer.capabilities.getMaxAnisotropy());
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.72,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Subtle outer apron ground
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.02;
    scene.add(apron);

    // Build machines
    const rigs = new Map<string, MachineRig>();
    const clickableProxies: THREE.Object3D[] = [];
    for (const m of machinesRef.current) {
      const rig = buildCompositeMachine(m);
      scene.add(rig.group);
      rigs.set(m.id, rig);
      rig.group.traverse((obj) => {
        if (obj.userData.machineId) clickableProxies.push(obj);
      });
    }
    rigsRef.current = rigs;

    // Selection highlight pedestal outline
    const selRingGeo = new THREE.RingGeometry(2.55, 2.72, 48);
    selRingGeo.rotateX(-Math.PI / 2);
    const selRingMat = new THREE.MeshBasicMaterial({
      color: 0x2563a6,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const selRing = new THREE.Mesh(selRingGeo, selRingMat);
    selRing.position.y = 0.04;
    scene.add(selRing);

    // Raycasting
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return; // drag orbit, not click
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableProxies, false);
      if (hits.length > 0) {
        const mId = hits[0].object.userData.machineId as string | undefined;
        if (mId) onSelectRef.current(mId);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Animation loop
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(0.1, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      // Update selection ring position
      const selM = machinesRef.current.find((m) => m.id === selectedIdRef.current);
      if (selM) {
        selRing.visible = true;
        selRing.position.x = selM.position3D[0];
        selRing.position.z = selM.position3D[2];
      } else {
        selRing.visible = false;
      }

      // Smooth damped camera preset
      if (cameraPresetRef.current.active) {
        const camP = cameraPresetRef.current;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camP.pos.x, 6, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camP.pos.y, 6, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, camP.pos.z, 6, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, camP.target.x, 6, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, camP.target.y, 6, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, camP.target.z, 6, delta);
        if (
          camera.position.distanceTo(camP.pos) < 0.08 &&
          controls.target.distanceTo(camP.target) < 0.05
        ) {
          camP.active = false;
        }
      }

      // Animate machines from live backend state
      for (const m of machinesRef.current) {
        const rig = rigsRef.current.get(m.id);
        if (!rig) continue;

        const isOnline = m.status !== 'offline' && m.rpm > 0;
        const speedFactor = isOnline ? Math.max(0.4, m.rpm / 1500) : 0;

        if (rig.movingPart && isOnline) {
          if (rig.modelType === 'cnc') {
            rig.movingPart.rotation.y += delta * 6.5 * speedFactor;
          } else if (rig.modelType === 'compressor') {
            rig.movingPart.rotation.z -= delta * 5.0 * speedFactor;
          } else if (rig.modelType === 'conveyor') {
            rig.movingPart.position.x = ((elapsed * 0.65) % 1.1) - 0.55;
          } else if (rig.modelType === 'press') {
            rig.movingPart.position.y = Math.sin(elapsed * 2.2) * 0.28;
          } else if (rig.modelType === 'packaging') {
            rig.movingPart.position.y = 1.35 + Math.sin(elapsed * 3.0) * 0.16;
            if (rig.secondaryPart) rig.secondaryPart.rotation.z += delta * 2.5;
          }
        }

        // Physical vibration jitter when machine vibration exceeds threshold
        if (isOnline && m.vibration > m.thresholds.maxVibration) {
          const intensity = Math.min(0.085, (m.vibration - m.thresholds.maxVibration) * 0.025);
          rig.group.position.x = rig.basePos.x + Math.sin(elapsed * 52) * intensity;
          rig.group.position.z = rig.basePos.z + Math.cos(elapsed * 47) * intensity;
        } else {
          rig.group.position.x = rig.basePos.x;
          rig.group.position.z = rig.basePos.z;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => mat.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      floorTex.dispose();
      renderer.dispose();
    };
  }, [viewMode, force2DFallback]);

  const zoomCamera = (factor: number) => {
    const cam = cameraPresetRef.current;
    const offset = cam.pos.clone().sub(cam.target).multiplyScalar(factor);
    if (offset.length() >= 6 && offset.length() <= 35) {
      cam.pos.copy(cam.target).add(offset);
      cam.active = true;
    }
  };

  if (webglError || viewMode === '2d' || force2DFallback) {
    return (
      <div className="relative w-full h-full min-h-[460px] bg-[#EAF0F6] border border-[#D9E0E7] rounded-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#D9E0E7]">
          <div className="text-xs font-medium text-[#172B4D]">
            2D Plant Floor Schematic {webglError ? '(WebGL Fallback Active)' : ''}
          </div>
          {!webglError && !force2DFallback && (
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6] whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              Switch to 3D Twin
            </button>
          )}
        </div>
        <div className="flex-1 p-4 flex items-center justify-center">
          <svg viewBox="0 0 800 480" className="w-full h-full max-h-[440px] bg-white border border-[#D9E0E7] rounded">
            <defs>
              <pattern id="grid2d" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#EAF0F6" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="800" height="480" fill="url(#grid2d)" />
            <rect x="24" y="24" width="752" height="432" fill="none" stroke="#D99A25" strokeWidth="2" strokeDasharray="8 6" />
            <line x1="24" y1="240" x2="776" y2="240" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="10 8" />
            <text x="40" y="48" className="fill-[#667586] text-[12px] font-medium">
              Bay A / B / C — Primary Machining &amp; Utilities
            </text>
            <text x="40" y="266" className="fill-[#667586] text-[12px] font-medium">
              Bay A / D — Forming &amp; End-of-Line Packaging
            </text>
            {machines.map((m) => {
              const cx = 400 + m.position3D[0] * 30;
              const cy = 240 + m.position3D[2] * 26;
              const isSelected = m.id === selectedMachineId;
              const color = STATUS_CSS[m.status];
              return (
                <g
                  key={m.id}
                  onClick={() => onSelectMachine(m.id)}
                  className="cursor-pointer"
                >
                  <rect
                    x={cx - 72}
                    y={cy - 44}
                    width="144"
                    height="88"
                    rx="6"
                    fill="#FFFFFF"
                    stroke={isSelected ? '#2563A6' : color}
                    strokeWidth={isSelected ? 3 : 2}
                  />
                  <rect x={cx - 72} y={cy - 44} width="144" height="8" rx="2" fill={color} />
                  <text x={cx - 60} y={cy - 16} className="fill-[#172B4D] text-[12px] font-semibold font-mono">
                    {m.id}
                  </text>
                  <text x={cx - 60} y={cy + 3} className="fill-[#172334] text-[12px] font-medium">
                    {m.name.slice(0, 19)}
                  </text>
                  <text x={cx - 60} y={cy + 24} className="fill-[#667586] text-[11px] font-mono tabular-nums">
                    {m.temperature}°C · {m.vibration}mm/s
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[480px] bg-[#EAF0F6] border border-[#D9E0E7] rounded-md overflow-hidden">
      {/* Isolated WebGL canvas mount */}
      <div ref={mountRef} className="w-full h-full min-h-[480px] cursor-grab active:cursor-grabbing" />

      {/* Top-left semantic status legend (no backdrop-filter over WebGL) */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 border border-[#D9E0E7] rounded px-3 py-2 shadow-sm pointer-events-auto">
        <div className="text-xs font-semibold text-[#172B4D]">
          Live 3D Plant Floor Twin
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-[#667586]">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#16836B]" /> Running
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#D99A25]" /> Warning
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#C74747]" /> Critical
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#7B8794]" /> Offline
          </span>
        </div>
      </div>

      {/* Top-right machine quick selector pills */}
      <div className="absolute top-3 right-3 z-10 flex flex-wrap gap-1.5 max-w-[320px] justify-end pointer-events-auto">
        {machines.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              onSelectMachine(m.id);
              setTimeout(() => applyCameraPreset('focus'), 20);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              m.id === selectedMachineId
                ? 'bg-[#172B4D] text-white border-[#172B4D]'
                : 'bg-white/95 text-[#172334] border-[#D9E0E7] hover:border-[#2563A6]'
            }`}
          >
            <span
              className="w-2 h-2 rounded-[2px] shrink-0"
              style={{ backgroundColor: STATUS_CSS[m.status] }}
            />
            {m.id}
          </button>
        ))}
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center pointer-events-auto max-w-[95%]">
        <button
          type="button"
          onClick={() => setControlsCollapsed((v) => !v)}
          className="px-3 py-1 text-[11px] font-medium bg-white/95 text-[#172B4D] border border-[#D9E0E7] border-b-0 rounded-t hover:bg-[#EAF0F6] whitespace-nowrap"
        >
          {controlsCollapsed ? 'Show Camera Controls' : 'Hide Controls'}
        </button>
        {!controlsCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 bg-white/95 border border-[#D9E0E7] rounded px-3 py-2 shadow-sm">
            <button
              type="button"
              onClick={() => applyCameraPreset('iso')}
              className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                activePreset === 'iso'
                  ? 'bg-[#2563A6] text-white'
                  : 'text-[#172334] hover:bg-[#EAF0F6]'
              }`}
            >
              Isometric View
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('top')}
              className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                activePreset === 'top'
                  ? 'bg-[#2563A6] text-white'
                  : 'text-[#172334] hover:bg-[#EAF0F6]'
              }`}
            >
              Top-Down Floor
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('focus')}
              className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                activePreset === 'focus'
                  ? 'bg-[#2563A6] text-white'
                  : 'text-[#172334] hover:bg-[#EAF0F6]'
              }`}
            >
              Focus {selectedMachineId}
            </button>
            <span className="h-4 w-px bg-[#D9E0E7] mx-1 hidden sm:inline-block" />
            <button
              type="button"
              onClick={() => zoomCamera(0.82)}
              className="p-1.5 text-[#172334] hover:bg-[#EAF0F6] rounded"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => zoomCamera(1.22)}
              className="p-1.5 text-[#172334] hover:bg-[#EAF0F6] rounded"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('iso')}
              className="p-1.5 text-[#172334] hover:bg-[#EAF0F6] rounded"
              title="Reset camera"
              aria-label="Reset camera"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <span className="h-4 w-px bg-[#D9E0E7] mx-1 hidden sm:inline-block" />
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#172334] hover:bg-[#EAF0F6] rounded whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              2D Schematic
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
