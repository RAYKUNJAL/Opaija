import { useEffect, useRef } from "react";
import * as THREE from "three";

export function Opaija3DHero() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 0.6, 8.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const coreLight = new THREE.PointLight(0xf3a712, 4.5, 16);
    coreLight.position.set(0, 0.2, 2);
    scene.add(coreLight);
    scene.add(new THREE.AmbientLight(0x2b3450, 1.6));

    const wordGroup = new THREE.Group();
    group.add(wordGroup);

    const portalGroup = new THREE.Group();
    group.add(portalGroup);
    [-3.2, 3.2].forEach((x, index) => {
      const portal = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.025, 14, 128),
        new THREE.MeshBasicMaterial({
          color: index === 0 ? 0x18d4d0 : 0xf3a712,
          transparent: true,
          opacity: 0.44,
        }),
      );
      portal.position.set(x, 0.35, -1.2);
      portal.rotation.y = index === 0 ? 0.42 : -0.42;
      portalGroup.add(portal);
    });

    const environmentMaterial = new THREE.MeshBasicMaterial({
      color: 0x0b6f6f,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 9; i += 1) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 1.3 + Math.random() * 1.6), environmentMaterial);
      plane.position.set(-4.8 + i * 1.2, -1.45 + Math.random() * 0.25, -2.4 - Math.random() * 1.6);
      plane.rotation.z = (Math.random() - 0.5) * 0.18;
      group.add(plane);
    }

    const letterMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff4d6,
      metalness: 0.35,
      roughness: 0.24,
      emissive: 0x2a1600,
      emissiveIntensity: 0.25,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe85d04,
      metalness: 0.55,
      roughness: 0.2,
      emissive: 0x5e1b00,
      emissiveIntensity: 0.35,
    });

    const letters = "OPAIJA".split("");
    letters.forEach((letter, index) => {
      const width = letter === "I" ? 0.22 : 0.54;
      const shape = createRoundedRectShape(width, 1.05, 0.04);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.025 });
      const mesh = new THREE.Mesh(geometry, index % 2 === 0 ? letterMaterial : edgeMaterial);
      mesh.position.set((index - 2.7) * 0.78, -0.1, 0);
      mesh.scale.x = letter === "I" ? 0.65 : 1;
      wordGroup.add(mesh);
    });
    wordGroup.position.set(-0.1, 0.55, 0);
    wordGroup.rotation.set(-0.16, -0.28, 0.05);
    wordGroup.scale.set(1.25, 1.25, 1.25);

    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.07, 5.9, 18),
      new THREE.MeshStandardMaterial({
        color: 0x8d5428,
        metalness: 0.25,
        roughness: 0.36,
        emissive: 0x3b1704,
        emissiveIntensity: 0.2,
      }),
    );
    staff.position.set(1.95, -0.1, 0.45);
    staff.rotation.z = -0.82;
    staff.rotation.x = 0.16;
    group.add(staff);

    const fighter = createFighter();
    fighter.position.set(-1.55, -0.95, 0.7);
    fighter.rotation.y = -0.28;
    group.add(fighter);

    const rings = new THREE.Group();
    for (let i = 0; i < 7; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72 + i * 0.34, 0.012, 10, 96),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0x18d4d0 : 0xf3a712,
          transparent: true,
          opacity: 0.28 - i * 0.025,
        }),
      );
      ring.rotation.x = Math.PI / 2.55;
      ring.rotation.z = i * 0.22;
      rings.add(ring);
    }
    rings.position.set(0.35, 0.15, -0.35);
    group.add(rings);

    const shardGeometry = new THREE.TetrahedronGeometry(0.075, 0);
    const shardMaterial = new THREE.MeshStandardMaterial({
      color: 0x9dfaff,
      metalness: 0.55,
      roughness: 0.18,
      emissive: 0x0a6062,
      emissiveIntensity: 0.55,
    });
    const shards = Array.from({ length: 72 }, () => {
      const shard = new THREE.Mesh(shardGeometry, shardMaterial);
      const radius = 1.2 + Math.random() * 3.6;
      const angle = Math.random() * Math.PI * 2;
      shard.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.56, (Math.random() - 0.5) * 2.7);
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      shard.userData = { angle, radius, speed: 0.2 + Math.random() * 0.8, lift: Math.random() * 0.7 };
      group.add(shard);
      return shard;
    });

    const sparkGeometry = new THREE.SphereGeometry(0.025, 8, 8);
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sparks = Array.from({ length: 120 }, () => {
      const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
      spark.userData = {
        angle: Math.random() * Math.PI * 2,
        radius: 1 + Math.random() * 4.5,
        speed: 0.4 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
      };
      group.add(spark);
      return spark;
    });

    let mouseX = 0;
    let mouseY = 0;
    const pointer = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      mouseX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener("pointermove", pointer);

    const startTime = performance.now();
    let frameId = 0;
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const strike = Math.sin(elapsed * 1.72);
      group.rotation.y = mouseX * 0.12 + Math.sin(elapsed * 0.26) * 0.08;
      group.rotation.x = -mouseY * 0.05 + Math.sin(elapsed * 0.31) * 0.035;
      wordGroup.position.y = 0.52 + Math.sin(elapsed * 1.2) * 0.05;
      wordGroup.scale.setScalar(1.25 + Math.max(0, strike) * 0.045);
      staff.rotation.z = -0.82 + Math.sin(elapsed * 1.72) * 0.12;
      staff.position.x = 1.95 + Math.max(0, strike) * 0.18;
      fighter.position.x = -2.35 + ((elapsed * 0.46) % 1) * 1.65 + Math.max(0, strike) * 0.2;
      fighter.position.y = -0.95 + Math.sin(elapsed * 7.2) * 0.055;
      fighter.rotation.z = Math.sin(elapsed * 4.8) * 0.035;
      animateFighter(fighter, elapsed, strike);
      portalGroup.children.forEach((portal, index) => {
        portal.rotation.z = elapsed * (index === 0 ? 0.42 : -0.38);
        portal.scale.setScalar(1 + Math.sin(elapsed * 1.4 + index) * 0.08);
      });
      rings.rotation.z = elapsed * 0.22;
      rings.scale.setScalar(1 + Math.max(0, strike) * 0.14);
      coreLight.intensity = 4.4 + Math.max(0, strike) * 3.4;

      shards.forEach((shard) => {
        const { angle, radius, speed, lift } = shard.userData;
        const orbit = angle + elapsed * speed * 0.35;
        shard.position.x = Math.cos(orbit) * radius;
        shard.position.y = Math.sin(orbit) * radius * 0.42 + Math.sin(elapsed * 2 + lift) * 0.16;
        shard.rotation.x += 0.012 + speed * 0.004;
        shard.rotation.y += 0.018 + speed * 0.006;
      });

      sparks.forEach((spark) => {
        const { angle, radius, speed, phase } = spark.userData;
        const pulse = 0.65 + Math.sin(elapsed * 3.2 + phase) * 0.35;
        spark.position.x = Math.cos(angle + elapsed * speed * 0.18) * radius * pulse;
        spark.position.y = Math.sin(angle + elapsed * speed * 0.18) * radius * 0.5 * pulse;
        spark.position.z = Math.sin(elapsed * speed + phase) * 1.2;
        spark.scale.setScalar(0.6 + pulse * 1.6);
      });

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", pointer);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    };
  }, []);

  return <div ref={mountRef} className="opaija-3d-canvas" aria-hidden="true" />;
}

function createRoundedRectShape(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  shape.moveTo(radius, 0);
  shape.lineTo(width - radius, 0);
  shape.quadraticCurveTo(width, 0, width, radius);
  shape.lineTo(width, height - radius);
  shape.quadraticCurveTo(width, height, width - radius, height);
  shape.lineTo(radius, height);
  shape.quadraticCurveTo(0, height, 0, height - radius);
  shape.lineTo(0, radius);
  shape.quadraticCurveTo(0, 0, radius, 0);
  return shape;
}

function createFighter() {
  const fighter = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x9b5a2f, roughness: 0.45, metalness: 0.08 });
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x12151b,
    roughness: 0.32,
    metalness: 0.18,
    emissive: 0x130600,
    emissiveIntensity: 0.18,
  });
  const orange = new THREE.MeshBasicMaterial({ color: 0xe85d04 });
  const gold = new THREE.MeshBasicMaterial({ color: 0xf3a712 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.72, 8, 14), cloth);
  torso.name = "torso";
  torso.position.y = 0.78;
  fighter.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), skin);
  head.name = "head";
  head.position.y = 1.37;
  fighter.add(head);

  for (let i = 0; i < 14; i += 1) {
    const loc = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.45, 6), cloth);
    loc.position.set((Math.random() - 0.5) * 0.36, 1.25 + Math.random() * 0.16, -0.12 - Math.random() * 0.12);
    loc.rotation.x = 0.5 + Math.random() * 0.6;
    loc.rotation.z = (Math.random() - 0.5) * 0.7;
    fighter.add(loc);
    if (i % 3 === 0) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), orange);
      bead.position.copy(loc.position);
      bead.position.y -= 0.18;
      fighter.add(bead);
    }
  }

  const sash = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.08), orange);
  sash.position.y = 0.48;
  sash.rotation.z = -0.18;
  fighter.add(sash);

  const parts = [
    ["leftArm", -0.36, 0.82, 0.08, 0.56],
    ["rightArm", 0.36, 0.82, -0.08, 0.56],
    ["leftLeg", -0.15, 0.13, 0.08, 0.68],
    ["rightLeg", 0.15, 0.13, -0.08, 0.68],
  ] as const;

  parts.forEach(([name, x, y, z, length]) => {
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, length, 6, 10), name.includes("Leg") ? cloth : skin);
    limb.name = name;
    limb.position.set(x, y, z);
    fighter.add(limb);
  });

  const fighterStaff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.032, 2.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x8d5428, metalness: 0.2, roughness: 0.28, emissive: 0x5c2200, emissiveIntensity: 0.26 }),
  );
  fighterStaff.name = "fighterStaff";
  fighterStaff.position.set(0.48, 0.75, 0.18);
  fighterStaff.rotation.z = -0.98;
  fighter.add(fighterStaff);

  const pendant = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 8, 24), gold);
  pendant.position.set(0, 0.78, 0.24);
  fighter.add(pendant);

  fighter.scale.setScalar(0.82);
  return fighter;
}

function animateFighter(fighter: THREE.Group, elapsed: number, strike: number) {
  const gait = Math.sin(elapsed * 7.2);
  const counter = Math.cos(elapsed * 7.2);
  const leftArm = fighter.getObjectByName("leftArm");
  const rightArm = fighter.getObjectByName("rightArm");
  const leftLeg = fighter.getObjectByName("leftLeg");
  const rightLeg = fighter.getObjectByName("rightLeg");
  const torso = fighter.getObjectByName("torso");
  const head = fighter.getObjectByName("head");
  const fighterStaff = fighter.getObjectByName("fighterStaff");

  if (leftArm) leftArm.rotation.z = -0.72 + gait * 0.62 - Math.max(0, strike) * 0.35;
  if (rightArm) rightArm.rotation.z = 0.82 + counter * 0.58 + Math.max(0, strike) * 0.45;
  if (leftLeg) leftLeg.rotation.z = 0.18 + counter * 0.46;
  if (rightLeg) rightLeg.rotation.z = -0.18 + gait * 0.46;
  if (torso) torso.rotation.z = gait * 0.04;
  if (head) head.rotation.y = -0.18 + Math.max(0, strike) * 0.16;
  if (fighterStaff) {
    fighterStaff.rotation.z = -1.05 + Math.max(0, strike) * 1.35 + Math.sin(elapsed * 3.4) * 0.08;
    fighterStaff.position.x = 0.48 + Math.max(0, strike) * 0.42;
  }
}
