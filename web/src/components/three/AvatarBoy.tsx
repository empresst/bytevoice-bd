"use client";

import { Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { VoiceState } from "./ByteMascot";

/**
 * The receptionist: a VRM anime character (Sakurada Fumiriya by pixiv, VRoid Hub
 * licence: free use, credit not required) wearing a headset we add in code.
 * Lips move while the agent speaks, he smiles, blinks, follows the cursor, waves
 * on load and when a call connects, and nods while listening.
 */

const MODEL_URL = "/avatar/fumiriya.vrm";
const VOWELS = ["aa", "ih", "ou", "ee", "oh"] as const;

// Resting arm pose (VRM normalised bones; 0 = T-pose).
const REST = { upper: 1.2, lower: 0.15 };
// Wave: forearm raised with the palm turned to the viewer; it sways left-right
// around the camera axis (applied on top of the pose, so the palm stays facing out).
const FOREARM_REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -REST.lower));
// Palm turned to the viewer by twisting along the forearm and wrist (like a real
// arm), not by bending the elbow sideways, so the elbow skin stays smooth.
const FOREARM_WAVE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.78, 0, 1.85, "ZYX"));
const HAND_WAVE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.52, 0, 0, "ZYX"));
const IDENTITY = new THREE.Quaternion();
const CAMERA_AXIS = new THREE.Vector3(0, 0, 1);
const swingQ = new THREE.Quaternion();
const waveQ = new THREE.Quaternion();

function addHeadset(vrm: VRM) {
  const head = vrm.humanoid.getRawBoneNode("head");
  if (!head) return;
  const dark = new THREE.MeshStandardMaterial({ color: 0x232a4a, metalness: 0.4, roughness: 0.35 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0xffb02e, emissiveIntensity: 0.35 });
  const set = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.011, 12, 48, Math.PI), dark);
  band.scale.set(1, 1.05, 1);
  set.add(band);
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 32), dark);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(s * 0.118, 0, 0);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 32), amber);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(s * 0.132, 0, 0);
    set.add(cup, ring);
  }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 10), dark);
  boom.position.set(0.085, -0.07, 0.055);
  boom.rotation.set(1.05, 0.35, 0.75);
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 16), amber.clone());
  mic.name = "mic";
  mic.position.set(0.035, -0.105, 0.105);
  set.add(boom, mic);
  set.position.set(0, 0.085, -0.005);
  head.add(set);
  return mic.material as THREE.MeshStandardMaterial;
}

function Boy({ voice, onReady }: { voice: React.RefObject<VoiceState>; onReady: () => void }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const mic = useRef<THREE.MeshStandardMaterial | undefined>(undefined);
  const { camera, size } = useThree();
  const st = useRef({ t: 0, vowel: 0, nextVowel: 0, weights: {} as Record<string, number>, blink: 0, nextBlink: 2, wave: 2.4, wasInCall: false, nod: 0, nextNod: 3 });

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    let disposed = false;
    loader.load(MODEL_URL, (gltf) => {
      const v = gltf.userData.vrm as VRM;
      if (disposed) return VRMUtils.deepDispose(gltf.scene);
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(v); // face the camera
      v.scene.traverse((o) => { o.frustumCulled = false; });
      mic.current = addHeadset(v);
      setVrm(v);
      onReady();
    });
    return () => { disposed = true; };
  }, [onReady]);

  // Frame waist-up (head and shoulders on narrow screens), face in the top third.
  useEffect(() => {
    if (!vrm) return;
    vrm.update(0);
    const neck = new THREE.Vector3();
    vrm.humanoid.getNormalizedBoneNode("neck")!.getWorldPosition(neck);
    const narrow = size.width < 520;
    const target = neck.clone().add(new THREE.Vector3(0, narrow ? 0.0 : -0.06, 0));
    camera.position.set(0, target.y - 0.03, narrow ? 1.05 : 1.75);
    camera.lookAt(target);
  }, [vrm, camera, size.width]);

  useFrame(({ pointer }, dt) => {
    if (!vrm) return;
    const s = st.current;
    s.t += dt;
    const v = voice.current;
    const speaking = !!v?.speaking;
    const inCall = v?.phase === "live";
    const bone = (n: Parameters<typeof vrm.humanoid.getNormalizedBoneNode>[0]) => vrm.humanoid.getNormalizedBoneNode(n)!;
    const em = vrm.expressionManager!;
    const ease = (k: string, target: number, rate = 0.35) => {
      const cur = s.weights[k] ?? 0;
      const next = cur + (target - cur) * Math.min(1, rate);
      s.weights[k] = next;
      em.setValue(k, next);
    };

    // --- mouth: smile with teeth at rest; cycle vowel shapes while the agent talks
    if (speaking) {
      s.nextVowel -= dt;
      if (s.nextVowel <= 0) { s.vowel = (s.vowel + 1 + Math.floor(Math.random() * 3)) % VOWELS.length; s.nextVowel = 0.08 + Math.random() * 0.08; }
      const open = 0.35 + 0.45 * Math.abs(Math.sin(s.t * 13)) + Math.min(0.3, (v?.level ?? 0) * 3);
      VOWELS.forEach((k, i) => ease(k, i === s.vowel ? open : 0, 0.5));
      ease("joy", 0.25);
    } else {
      VOWELS.forEach((k) => ease(k, k === "ee" ? 0.45 : 0, 0.3));
      ease("joy", 0.55, 0.15);
    }

    // --- blink
    s.nextBlink -= dt;
    if (s.nextBlink <= 0) { s.blink = 1; s.nextBlink = 2 + Math.random() * 3.5; }
    s.blink = Math.max(0, s.blink - dt * 7);
    em.setValue("blink", Math.sin(s.blink * Math.PI));

    // --- head follows the cursor; small nods while listening on a call
    if (inCall && !speaking) {
      s.nextNod -= dt;
      if (s.nextNod <= 0) { s.nod = 1; s.nextNod = 2.5 + Math.random() * 3; }
    }
    s.nod = Math.max(0, s.nod - dt * 1.6);
    const head = bone("head"), neck = bone("neck");
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, pointer.x * 0.35, 0.08);
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, -pointer.y * 0.15 + Math.sin(s.nod * Math.PI * 2) * 0.12 + (speaking ? Math.sin(s.t * 7) * 0.025 : 0), 0.12);
    head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, inCall && !speaking ? 0.06 : Math.sin(s.t * 0.7) * 0.02, 0.05);
    neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, pointer.x * 0.12, 0.06);

    // --- breathing
    bone("chest").rotation.x = Math.sin(s.t * 1.8) * 0.015;
    bone("spine").rotation.z = Math.sin(s.t * 0.9) * 0.012;

    // --- arms: wave on load and when a call connects; small gestures while talking
    if (inCall !== s.wasInCall) { s.wasInCall = inCall; if (inCall) s.wave = 2.4; }
    s.wave = Math.max(0, s.wave - dt * 0.5);
    const w = Math.min(1, s.wave * 2.5) * Math.min(1, (2.4 - s.wave) * 4); // raise, wave, lower
    const ru = bone("rightUpperArm"), rl = bone("rightLowerArm"), rh = bone("rightHand");
    const lu = bone("leftUpperArm"), ll = bone("leftLowerArm");
    const gesture = speaking ? Math.max(0, Math.sin(s.t * 2.2)) * 0.18 : 0;
    const swing = Math.sin(s.t * 8);
    ru.rotation.z = THREE.MathUtils.lerp(-REST.upper, -0.55, w) + gesture * 0.5;
    swingQ.setFromAxisAngle(CAMERA_AXIS, swing * 0.45);
    waveQ.copy(FOREARM_WAVE).premultiply(swingQ);
    rl.quaternion.copy(FOREARM_REST).slerp(waveQ, w);
    rh.quaternion.copy(IDENTITY).slerp(HAND_WAVE, w);
    lu.rotation.z = REST.upper - gesture * 0.4;
    ll.rotation.z = REST.lower + gesture;
    ll.rotation.y = -gesture * 1.2;

    if (mic.current) mic.current.emissiveIntensity = 0.35 + (speaking ? 1.6 : 0) + (inCall ? 0.5 : 0);
    vrm.update(dt); // also runs hair/clothes physics
  });

  return vrm ? <primitive object={vrm.scene} /> : null;
}

export default function AvatarBoy({ voice }: { voice: React.RefObject<VoiceState> }) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className="relative h-full w-full [mask-image:linear-gradient(to_bottom,black_72%,transparent_98%)]">
      {!ready && <div className="absolute left-1/2 top-1/3 h-56 w-56 -translate-x-1/2 animate-pulse rounded-full bg-indigo-400/20 blur-2xl" aria-hidden />}
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 30, near: 0.1, far: 20, position: [0, 1.2, 1.5] }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        className={`transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
        aria-label="The AI receptionist, a 3D anime character wearing a headset"
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[1, 2, 3]} intensity={2.1} />
        <directionalLight position={[-2, 1, -2]} intensity={1.3} color="#ffb347" />
        <Boy voice={voice} onReady={onReady} />
        <Sparkles count={30} scale={[2.4, 1.6, 1]} position={[0, 1.2, -0.4]} size={1.6} speed={0.3} color="#ffd58a" opacity={0.55} />
      </Canvas>
    </div>
  );
}
