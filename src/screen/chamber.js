// Rectangular gacha cabinet for the screen mode.
// Visual reference: LUCKY GRAB / NEXIS chamber renders (dark navy cabinet,
// cyan neon outline, skylight, NEXTIS sign at top, rock pile, claw on cable).
// Physics + rock fragments ported from the PoC HTML.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const PALETTE = {
  bg: 0x050a14,
  cabinet: 0x0c1422,
  cabinetEdge: 0x18253c,
  neonCyan: 0x4dd0ff,
  neonSoftBlue: 0x6a88ff,
  rockTones: [0x2a3548, 0x1f2a3d, 0x35435a, 0x252f42],
  white: 0xffffff,
};

// World-unit dimensions of the cabinet
const CAB = {
  innerW: 4.6,   // x — inner chamber width
  innerD: 2.6,   // z — inner depth
  innerH: 8.4,   // y — inner height (rocks + airspace above)
  wallT: 0.18,   // glass thickness
  baseH: 1.1,    // bottom control panel
  topH: 1.4,     // top sign panel (NEXTIS)
  skylightH: 0.4, // skylight panel inside top
};

export function createChamber({ width, height, container }) {
  // ---- Renderer ---------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = `${width}px`;
  renderer.domElement.style.height = `${height}px`;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = null; // transparent — stage background shows through

  // Camera: portrait aspect (e.g. 0.4 for 1000x2500) → use wider vertical FOV
  // so the cabinet's full height fits while keeping the horizontal proportional.
  const aspect = width / height;
  const fov = aspect < 0.5 ? 48 : 36;
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
  // Frame the whole cabinet (totalH ≈ 10.9, width ≈ 5.45). For portrait
  // (aspect ~0.4) we sit further back so the side walls aren't clipped.
  const cabCenterY = (CAB.baseH + CAB.innerH + CAB.topH) / 2;
  const camDist = aspect < 0.5 ? 18 : 12;
  camera.position.set(0, cabCenterY + 0.6, camDist);
  camera.lookAt(0, cabCenterY - 0.4, 0);

  // ---- Lighting ---------------------------------------------------------
  scene.add(new THREE.AmbientLight(0x1a2a44, 0.55));

  // Skylight: large rect area light right below the top section, shining down
  const skyY = CAB.baseH + CAB.innerH - 0.05;
  const skylight = new THREE.RectAreaLight(0xeaf6ff, 9, CAB.innerW * 0.82, CAB.innerD * 0.65);
  skylight.position.set(0, skyY, 0);
  skylight.lookAt(0, 0, 0);
  scene.add(skylight);

  // Cyan rim lights on left/right walls (the neon glow strips)
  const rimLeft = new THREE.PointLight(PALETTE.neonCyan, 18, 10, 1.4);
  rimLeft.position.set(-CAB.innerW * 0.45, CAB.baseH + CAB.innerH * 0.55, 1.6);
  scene.add(rimLeft);
  const rimRight = new THREE.PointLight(PALETTE.neonSoftBlue, 14, 10, 1.4);
  rimRight.position.set(CAB.innerW * 0.45, CAB.baseH + CAB.innerH * 0.55, 1.6);
  scene.add(rimRight);

  // Soft fill from above-front for the rocks
  const key = new THREE.DirectionalLight(0xffffff, 0.45);
  key.position.set(2, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  scene.add(key);

  // ---- Physics ----------------------------------------------------------
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -16, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 12;
  world.allowSleep = true;

  const rockMaterial = new CANNON.Material('rock');
  const wallMaterial = new CANNON.Material('wall');
  world.addContactMaterial(
    new CANNON.ContactMaterial(rockMaterial, wallMaterial, { friction: 0.4, restitution: 0.25 })
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(rockMaterial, rockMaterial, { friction: 0.55, restitution: 0.15 })
  );

  // Helper to add static physics walls
  function addStaticBox(sx, sy, sz, px, py, pz) {
    const body = new CANNON.Body({ mass: 0, material: wallMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
    body.position.set(px, py, pz);
    world.addBody(body);
    return body;
  }

  // ---- Cabinet structure ------------------------------------------------
  const cabinetGroup = new THREE.Group();
  scene.add(cabinetGroup);

  const innerFloorY = CAB.baseH;
  const innerTopY = CAB.baseH + CAB.innerH;
  const totalH = CAB.baseH + CAB.innerH + CAB.topH;

  // Cabinet body: dark navy panels around the chamber (back + sides + top + base).
  const bodyMat = new THREE.MeshStandardMaterial({
    color: PALETTE.cabinet,
    roughness: 0.6,
    metalness: 0.4,
  });

  // Back panel (z = -innerD/2 - small gap)
  const backPanel = new THREE.Mesh(
    new THREE.BoxGeometry(CAB.innerW + 0.8, totalH, 0.2),
    bodyMat
  );
  backPanel.position.set(0, totalH / 2, -CAB.innerD / 2 - 0.1);
  backPanel.receiveShadow = true;
  cabinetGroup.add(backPanel);

  // Side panels (left/right)
  const sidePanelGeom = new THREE.BoxGeometry(0.4, totalH, CAB.innerD + 0.2);
  const sideL = new THREE.Mesh(sidePanelGeom, bodyMat);
  sideL.position.set(-CAB.innerW / 2 - 0.2, totalH / 2, 0);
  cabinetGroup.add(sideL);
  const sideR = sideL.clone();
  sideR.position.x = CAB.innerW / 2 + 0.2;
  cabinetGroup.add(sideR);

  // Base block (bottom housing — control panel)
  const baseBlock = new THREE.Mesh(
    new THREE.BoxGeometry(CAB.innerW + 0.8, CAB.baseH, CAB.innerD + 0.4),
    bodyMat
  );
  baseBlock.position.set(0, CAB.baseH / 2, 0);
  baseBlock.castShadow = true;
  baseBlock.receiveShadow = true;
  cabinetGroup.add(baseBlock);

  // Top block (where the sign sits)
  const topBlock = new THREE.Mesh(
    new THREE.BoxGeometry(CAB.innerW + 0.8, CAB.topH, CAB.innerD + 0.4),
    bodyMat
  );
  topBlock.position.set(0, innerTopY + CAB.topH / 2, 0);
  cabinetGroup.add(topBlock);

  // Chamber floor (inside) — slightly glossy dark plate
  const innerFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB.innerW, CAB.innerD),
    new THREE.MeshStandardMaterial({
      color: 0x0a1428,
      roughness: 0.4,
      metalness: 0.65,
    })
  );
  innerFloor.rotation.x = -Math.PI / 2;
  innerFloor.position.y = innerFloorY;
  innerFloor.receiveShadow = true;
  cabinetGroup.add(innerFloor);

  // Skylight panel: bright glowing rect inside the top of the chamber
  const skylightPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB.innerW * 0.82, CAB.innerD * 0.65),
    new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.92 })
  );
  skylightPanel.rotation.x = Math.PI / 2;
  skylightPanel.position.set(0, innerTopY - 0.04, 0);
  cabinetGroup.add(skylightPanel);

  // Skylight frame trim around the panel
  const skylightFrame = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB.innerW * 0.92, CAB.innerD * 0.75),
    new THREE.MeshBasicMaterial({ color: PALETTE.neonCyan, transparent: true, opacity: 0.55 })
  );
  skylightFrame.rotation.x = Math.PI / 2;
  skylightFrame.position.set(0, innerTopY - 0.08, 0);
  cabinetGroup.add(skylightFrame);

  // Glass walls (front + sides). Use very low-opacity transmission for hint of reflection.
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x6699ff,
    metalness: 0,
    roughness: 0.08,
    transmission: 0.92,
    transparent: true,
    opacity: 0.10,
    ior: 1.4,
    thickness: 0.3,
    side: THREE.DoubleSide,
  });
  const glassFront = new THREE.Mesh(
    new THREE.BoxGeometry(CAB.innerW, CAB.innerH, CAB.wallT),
    glassMat
  );
  glassFront.position.set(0, innerFloorY + CAB.innerH / 2, CAB.innerD / 2);
  cabinetGroup.add(glassFront);

  // Neon cyan outline around the front face of the chamber
  const neonLineMat = new THREE.LineBasicMaterial({
    color: PALETTE.neonCyan,
    transparent: true,
    opacity: 0.95,
  });
  const frontEdges = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(CAB.innerW + 0.05, CAB.innerH + 0.05, 0.02)
  );
  const frontOutline = new THREE.LineSegments(frontEdges, neonLineMat);
  frontOutline.position.set(0, innerFloorY + CAB.innerH / 2, CAB.innerD / 2 + 0.22);
  cabinetGroup.add(frontOutline);

  // Outer cabinet outline (the big neon rectangle visible in image 2)
  const outerEdges = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(CAB.innerW + 0.85, totalH + 0.05, CAB.innerD + 0.45)
  );
  const outerOutline = new THREE.LineSegments(
    outerEdges,
    new THREE.LineBasicMaterial({ color: PALETTE.neonCyan, transparent: true, opacity: 0.85 })
  );
  outerOutline.position.set(0, totalH / 2, 0);
  cabinetGroup.add(outerOutline);

  // ---- NEXTIS sign (canvas-textured plane on the top block face) -------
  const sign = buildSign('NEXTIS LAB', 1024, 256);
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB.innerW * 0.62, CAB.topH * 0.65),
    new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true })
  );
  // Sign sits ON the front face of the top block — push it forward of the
  // side-panel depth (sides extend to z = innerD/2 + 0.1).
  const signZ = CAB.innerD / 2 + 0.23;
  signMesh.position.set(0, innerTopY + CAB.topH * 0.55, signZ + 0.02);
  cabinetGroup.add(signMesh);

  // Sign frame (dark plate behind the text, sits flush on the top block)
  const signFrame = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB.innerW * 0.66, CAB.topH * 0.72),
    new THREE.MeshBasicMaterial({ color: 0x0a1428 })
  );
  signFrame.position.set(0, innerTopY + CAB.topH * 0.55, signZ);
  cabinetGroup.add(signFrame);

  const signOutlineEdges = new THREE.EdgesGeometry(
    new THREE.PlaneGeometry(CAB.innerW * 0.66, CAB.topH * 0.72)
  );
  const signOutline = new THREE.LineSegments(
    signOutlineEdges,
    new THREE.LineBasicMaterial({ color: PALETTE.neonCyan, transparent: true, opacity: 0.9 })
  );
  signOutline.position.set(0, innerTopY + CAB.topH * 0.55, signZ + 0.01);
  cabinetGroup.add(signOutline);

  // ---- Base control panel detail (small screen + 2 buttons) -----------
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.45),
    new THREE.MeshBasicMaterial({ color: 0x021018 })
  );
  screen.position.set(-0.3, CAB.baseH * 0.6, CAB.innerD / 2 + 0.21);
  cabinetGroup.add(screen);

  const btn1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0x223044, roughness: 0.35, metalness: 0.7 })
  );
  btn1.rotation.x = Math.PI / 2;
  btn1.position.set(0.55, CAB.baseH * 0.6, CAB.innerD / 2 + 0.22);
  cabinetGroup.add(btn1);
  const btn2 = btn1.clone();
  btn2.position.x = 0.9;
  cabinetGroup.add(btn2);

  // Base neon underglow strip
  const baseStrip = new THREE.Mesh(
    new THREE.BoxGeometry(CAB.innerW + 0.4, 0.04, 0.04),
    new THREE.MeshBasicMaterial({ color: PALETTE.neonCyan, transparent: true, opacity: 0.85 })
  );
  baseStrip.position.set(0, 0.08, CAB.innerD / 2 + 0.22);
  cabinetGroup.add(baseStrip);

  // ---- Physics walls (floor + 4 sides + ceiling) ----------------------
  // Floor at innerFloorY
  addStaticBox(CAB.innerW, 0.2, CAB.innerD, 0, innerFloorY - 0.1, 0);
  // Side walls
  addStaticBox(0.2, CAB.innerH, CAB.innerD, -CAB.innerW / 2, innerFloorY + CAB.innerH / 2, 0);
  addStaticBox(0.2, CAB.innerH, CAB.innerD, CAB.innerW / 2, innerFloorY + CAB.innerH / 2, 0);
  // Front + back
  addStaticBox(CAB.innerW, CAB.innerH, 0.2, 0, innerFloorY + CAB.innerH / 2, -CAB.innerD / 2);
  addStaticBox(CAB.innerW, CAB.innerH, 0.2, 0, innerFloorY + CAB.innerH / 2, CAB.innerD / 2);
  // Ceiling — rocks would otherwise fly out the open top
  addStaticBox(CAB.innerW, 0.2, CAB.innerD, 0, innerTopY + 0.1, 0);

  // ---- Rock fragments ---------------------------------------------------
  const rocks = [];
  const rockGeoms = [0, 1, 2, 3].map(makeRockGeometry);

  function spawnRock(x, y, z, typeOverride) {
    const type = typeOverride !== undefined ? typeOverride : Math.floor(Math.random() * 4);
    const geo = rockGeoms[type];
    const scale = 0.55 + Math.random() * 0.42;

    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.rockTones[type],
      roughness: 0.85,
      metalness: 0.2,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cabinetGroup.add(mesh);

    const body = new CANNON.Body({
      mass: 1 + scale,
      material: rockMaterial,
      shape: new CANNON.Sphere(0.5 * scale),
      position: new CANNON.Vec3(x, y, z),
      angularDamping: 0.4,
      linearDamping: 0.05,
    });
    body.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4
    );
    world.addBody(body);
    rocks.push({ mesh, body, type });
  }

  // Spawn a dense pile, then pre-simulate so the cabinet is already populated
  // by the time the first frame renders. We distribute spawn Y across layers
  // so they fall into a fuller pile instead of collapsing onto each other.
  const initialCount = 80;
  for (let i = 0; i < initialCount; i++) {
    const layer = Math.floor(i / 12); // ~12 rocks per layer
    spawnRock(
      (Math.random() - 0.5) * (CAB.innerW - 1.2),
      innerFloorY + 0.6 + layer * 0.75 + Math.random() * 0.25,
      (Math.random() - 0.5) * (CAB.innerD - 0.9)
    );
  }
  // 6 seconds of pre-simulation at fixed 60Hz — enough for 80 rocks to settle.
  for (let i = 0; i < 360; i++) world.step(1 / 60);
  // Sync meshes to the settled body positions.
  for (const r of rocks) {
    r.mesh.position.copy(r.body.position);
    r.mesh.quaternion.copy(r.body.quaternion);
  }

  // ---- Claw mechanism (idle, hanging above the pile) -------------------
  const claw = buildClaw();
  claw.group.position.set(0, innerTopY - 1.4, 0);
  cabinetGroup.add(claw.group);

  // Cable from top of chamber to claw shackle — thicker KIA-blue rope.
  const cableTopY = innerTopY - 0.1;
  const clawShackleY = innerTopY - 1.4 + 0.34;
  const cableLen = cableTopY - clawShackleY;
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, cableLen, 12),
    new THREE.MeshStandardMaterial({
      color: 0x2c7fff,
      roughness: 0.55,
      metalness: 0.3,
      emissive: 0x0a2a66,
      emissiveIntensity: 0.1,
    })
  );
  cable.position.set(0, clawShackleY + cableLen / 2, 0);
  cabinetGroup.add(cable);

  // Cable pulley at the top (where it enters the ceiling housing)
  const pulley = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.4, metalness: 0.7 })
  );
  pulley.rotation.z = Math.PI / 2;
  pulley.position.set(0, cableTopY, 0);
  cabinetGroup.add(pulley);

  // ---- Real-time claw control (driven from controller inputs) ----------
  // Bounds keep the claw inside the chamber walls with margin for the scoop.
  const CLAW_X_MIN = -(CAB.innerW / 2) + claw.R + 0.15;
  const CLAW_X_MAX = +(CAB.innerW / 2) - claw.R - 0.15;
  const CLAW_Z_MIN = -(CAB.innerD / 2) + claw.R + 0.15;
  const CLAW_Z_MAX = +(CAB.innerD / 2) - claw.R - 0.15;
  let clawTargetX = 0;
  let clawTargetZ = 0;

  function setClawTarget(x, z) {
    clawTargetX = Math.max(CLAW_X_MIN, Math.min(CLAW_X_MAX, x));
    clawTargetZ = Math.max(CLAW_Z_MIN, Math.min(CLAW_Z_MAX, z));
  }

  // Apply a velocity-based nudge from held inputs. `dt` in seconds.
  const CLAW_SPEED = 3.2; // chamber units per second
  function applyInput({ left, right, up, down }, dt) {
    if (left)  clawTargetX -= CLAW_SPEED * dt;
    if (right) clawTargetX += CLAW_SPEED * dt;
    if (up)    clawTargetZ -= CLAW_SPEED * dt; // toward back of chamber
    if (down)  clawTargetZ += CLAW_SPEED * dt;
    clawTargetX = Math.max(CLAW_X_MIN, Math.min(CLAW_X_MAX, clawTargetX));
    clawTargetZ = Math.max(CLAW_Z_MIN, Math.min(CLAW_Z_MAX, clawTargetZ));
  }

  function getClawPosition() {
    return {
      x: claw.group.position.x,
      y: claw.group.position.y,
      z: claw.group.position.z,
    };
  }

  // ---- Extract animation state machine ---------------------------------
  // Idle Y: where the claw rests. Grab Y: just above the pile top.
  const IDLE_Y = innerTopY - 1.4;
  const GRAB_Y = innerFloorY + 2.6;
  const DELIVER_Y = innerTopY - 0.4; // up into the funnel
  const PHASES = {
    descend:  { dur: 1.05 },
    close:    { dur: 0.4 },
    ascend:   { dur: 0.85 },
    deliver:  { dur: 0.5 },
    release:  { dur: 0.5 },
    return:   { dur: 0.85 },
  };

  let extractAnim = null;

  function runExtract({ fragment, onComplete } = {}) {
    if (extractAnim) return false; // already busy
    // Snapshot the X/Z where the player aimed the claw — the extract animation
    // descends straight down here, so it grabs whatever's underneath.
    const grabX = claw.group.position.x;
    const grabZ = claw.group.position.z;

    // Pick the topmost rock close to the claw's X/Z so the grab looks plausible.
    const candidates = rocks
      .slice()
      .sort((a, b) => {
        const da = Math.hypot(a.body.position.x - grabX, a.body.position.z - grabZ);
        const db = Math.hypot(b.body.position.x - grabX, b.body.position.z - grabZ);
        // Weight by distance and inverse height so close + high rocks win.
        return (da - (a.body.position.y * 0.2)) - (db - (b.body.position.y * 0.2));
      })
      .slice(0, 6);
    const targetRock = candidates[Math.floor(Math.random() * candidates.length)];

    if (targetRock) {
      targetRock.body.type = CANNON.Body.KINEMATIC;
      targetRock.body.velocity.set(0, 0, 0);
      targetRock.body.angularVelocity.set(0, 0, 0);
    }

    extractAnim = {
      phase: 'descend',
      tStart: clock.getElapsedTime(),
      targetRock,
      fragment,
      onComplete,
      released: false,
      grabX,
      grabZ,
    };
    return true;
  }

  function updateExtract(t) {
    if (!extractAnim) return;
    const e = extractAnim;
    const phaseDur = PHASES[e.phase].dur;
    const p = Math.max(0, Math.min(1, (t - e.tStart) / phaseDur));

    switch (e.phase) {
      case 'descend': {
        claw.group.position.y = lerp(IDLE_Y, GRAB_Y, easeInOut(p));
        claw.group.position.x = e.grabX;
        claw.group.position.z = e.grabZ;
        claw.setJawOpen(easeOut(p)); // open as we descend
        if (p >= 1) advance(t, 'close');
        break;
      }
      case 'close': {
        claw.setJawOpen(1 - easeOut(p));
        if (e.targetRock) {
          // Snap the rock to the scoop bottom over the close duration so the
          // grab looks like the jaws caught the top of the pile.
          attachRockToClaw(e.targetRock, p);
        }
        if (p >= 1) advance(t, 'ascend');
        break;
      }
      case 'ascend': {
        claw.group.position.y = lerp(GRAB_Y, IDLE_Y, easeInOut(p));
        claw.group.position.x = e.grabX;
        claw.group.position.z = e.grabZ;
        if (e.targetRock) attachRockToClaw(e.targetRock, 1);
        if (p >= 1) advance(t, 'deliver');
        break;
      }
      case 'deliver': {
        claw.group.position.y = lerp(IDLE_Y, DELIVER_Y, easeInOut(p));
        claw.group.position.x = lerp(e.grabX, 0, easeInOut(p)); // drift back to center
        claw.group.position.z = lerp(e.grabZ, 0, easeInOut(p));
        if (e.targetRock) attachRockToClaw(e.targetRock, 1);
        if (p >= 1) advance(t, 'release');
        break;
      }
      case 'release': {
        claw.setJawOpen(easeOut(p));
        if (p >= 0.4 && !e.released && e.targetRock) {
          consumeRock(e.targetRock); // remove + spawn a replacement
          e.released = true;
        }
        if (p >= 1) advance(t, 'return');
        break;
      }
      case 'return': {
        claw.group.position.y = lerp(DELIVER_Y, IDLE_Y, easeInOut(p));
        claw.setJawOpen(1 - easeOut(p));
        if (p >= 1) {
          claw.group.position.y = IDLE_Y;
          claw.setJawOpen(0);
          const cb = e.onComplete;
          extractAnim = null;
          if (cb) cb();
        }
        break;
      }
    }
  }

  function advance(t, nextPhase) {
    extractAnim.phase = nextPhase;
    extractAnim.tStart = t;
  }

  function attachRockToClaw(rock, p) {
    // Position the rock progressively under the scoop bottom.
    const cx = claw.group.position.x;
    const cy = claw.group.position.y - (claw.SCOOP_H || 0.78) - 0.05;
    const cz = claw.group.position.z;
    if (p < 1) {
      rock.body.position.set(
        lerp(rock.body.position.x, cx, p),
        lerp(rock.body.position.y, cy, p),
        lerp(rock.body.position.z, cz, p)
      );
    } else {
      rock.body.position.set(cx, cy, cz);
    }
    rock.body.velocity.set(0, 0, 0);
  }

  function consumeRock(rock) {
    // Remove the carried rock and spawn a fresh one from above to keep the
    // pile at a consistent volume.
    world.removeBody(rock.body);
    cabinetGroup.remove(rock.mesh);
    rock.mesh.geometry = null; // geometry is shared; don't dispose
    rock.mesh.material.dispose();
    const idx = rocks.indexOf(rock);
    if (idx !== -1) rocks.splice(idx, 1);

    spawnRock(
      (Math.random() - 0.5) * (CAB.innerW - 1.4),
      innerTopY - 0.7,
      (Math.random() - 0.5) * (CAB.innerD - 1.0)
    );
  }

  // ---- Animation loop ---------------------------------------------------
  const clock = new THREE.Clock();
  let rafId = 0;

  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.getElapsedTime();

    world.step(1 / 60, dt, 3);
    for (const r of rocks) {
      r.mesh.position.copy(r.body.position);
      r.mesh.quaternion.copy(r.body.quaternion);
    }

    if (extractAnim) {
      updateExtract(t);
    } else {
      // Player-driven idle: ease claw toward target X/Z continuously.
      claw.group.position.x += (clawTargetX - claw.group.position.x) * Math.min(1, 10 * dt);
      claw.group.position.z += (clawTargetZ - claw.group.position.z) * Math.min(1, 10 * dt);
      claw.group.position.y = IDLE_Y;
      claw.group.rotation.y = Math.sin(t * 0.4) * 0.03; // tiny passive sway
    }

    // Cable follows the claw shackle position
    const sx = claw.group.position.x;
    const sy = claw.group.position.y + 0.34;
    const newLen = cableTopY - sy;
    cable.scale.y = newLen / cableLen;
    cable.position.set(sx, (cableTopY + sy) / 2, 0);

    // Subtle neon pulse on the front outline + sign
    const pulse = 0.85 + Math.sin(t * 1.4) * 0.15;
    frontOutline.material.opacity = 0.85 * pulse;
    signOutline.material.opacity = 0.85 * pulse;
    skylightPanel.material.opacity = 0.88 + Math.sin(t * 1.1) * 0.06;
    skylight.intensity = 8 + pulse * 2;

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    runExtract,
    setClawTarget,
    applyInput,
    getClawPosition,
    isExtracting: () => !!extractAnim,
    dispose() {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      renderer.domElement.remove();
    },
  };
}

// ---- Helpers ----------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeOut(t) {
  return 1 - Math.pow(1 - t, 2);
}
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function makeRockGeometry(type) {
  const geo = new THREE.IcosahedronGeometry(0.5, 1);
  const positions = geo.attributes.position;
  const seed = type * 13.37;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const noise =
      0.7 +
      Math.sin(x * 5 + seed) * 0.2 +
      Math.cos(y * 4 + seed) * 0.15 +
      Math.sin(z * 6 + seed) * 0.1;
    positions.setXYZ(i, x * noise, y * noise, z * noise);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildSign(text, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Neon glow effect
  ctx.font = `300 ${h * 0.55}px "JetBrains Mono", "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outer glow passes
  ctx.shadowColor = '#4dd0ff';
  ctx.shadowBlur = 36;
  ctx.fillStyle = '#cdebff';
  for (let i = 0; i < 3; i++) ctx.fillText(text, w / 2, h / 2);

  // Crisp core
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, texture: tex };
}

// KIA-style hexagonal scoop:
//   • open-top hex prism body
//   • two hinged "jaws" on top that swing open/closed
//   • exposes `setJawOpen(0..1)` for the extract animation in Step 5
function buildClaw() {
  const group = new THREE.Group();

  const SCOOP_BLUE = 0x2c7fff;
  const SCOOP_BLUE_DARK = 0x174ba8;

  const blueMat = new THREE.MeshStandardMaterial({
    color: SCOOP_BLUE,
    roughness: 0.32,
    metalness: 0.55,
    emissive: 0x0a2a66,
    emissiveIntensity: 0.18,
  });
  const blueDarkMat = new THREE.MeshStandardMaterial({
    color: SCOOP_BLUE_DARK,
    roughness: 0.4,
    metalness: 0.6,
  });

  // Hex prism dimensions
  const R = 0.62;                              // distance from center to hex vertex
  const APOTHEM = R * Math.cos(Math.PI / 6);   // center to edge midpoint
  const SCOOP_H = 0.78;
  const RIM_T = 0.05;

  // ---- Scoop body (open-top hex tube) -----------------------------------
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, SCOOP_H, 6, 1, true),
    blueMat
  );
  body.position.y = -SCOOP_H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Bottom cap (hex disc — closes the underside)
  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.06, 6),
    blueDarkMat
  );
  bottom.position.y = -SCOOP_H - 0.02;
  bottom.castShadow = true;
  group.add(bottom);

  // Rim ring (thicker accent right under where the jaws hinge)
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.04, R * 1.04, RIM_T, 6),
    blueDarkMat
  );
  rim.position.y = 0;
  group.add(rim);

  // ---- Top jaws ---------------------------------------------------------
  // Two flat hex-half plates, hinged on opposite parallel edges (z = ±APOTHEM).
  // openAmount=0 → both plates lie flat (sealed lid).
  // openAmount=1 → plates rotated ~75° outward (fully open).
  function makeJaw(direction) {
    const jaw = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(R * 2 * 0.96, 0.07, APOTHEM * 0.98),
      blueMat
    );
    // Plate extends from the hinge (jaw origin, at the rim edge) inward.
    plate.position.z = direction * (APOTHEM / 2);
    plate.castShadow = true;
    jaw.add(plate);
    return jaw;
  }

  const jawA = makeJaw(+1);  // hinge at -z rim, plate extends toward center
  jawA.position.set(0, 0.03, -APOTHEM);
  group.add(jawA);

  const jawB = makeJaw(-1);  // hinge at +z rim, plate extends toward center
  jawB.position.set(0, 0.03, +APOTHEM);
  group.add(jawB);

  // ---- Cable shackle on top --------------------------------------------
  // Looks like the KIA reference: a small post that the cable threads into.
  const shackle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.22, 0.08),
    blueMat
  );
  shackle.position.y = 0.18;
  group.add(shackle);

  const shackleCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 12),
    blueMat
  );
  shackleCap.position.y = 0.34;
  group.add(shackleCap);

  // ---- Public API for step 5 -------------------------------------------
  // 0 = fully closed (jaws flat over the rim), 1 = fully open (~75°).
  const MAX_OPEN = 1.3; // radians ≈ 75°
  function setJawOpen(amount) {
    const a = Math.max(0, Math.min(1, amount));
    // jawA extends in +z; positive x-rotation tilts +z edge DOWN (closes inward),
    // negative rotation tilts it UP (opens).
    jawA.rotation.x = -a * MAX_OPEN;
    jawB.rotation.x = +a * MAX_OPEN;
  }
  setJawOpen(0); // start closed

  return { group, setJawOpen, R, SCOOP_H };
}
