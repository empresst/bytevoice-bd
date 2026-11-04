"use client";

import { ContactShadows, Float, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Byte, ByteVoice's mascot, rebuilt in real time from simple shapes: a round blue
 * bird with glasses and a call-centre headset. It follows the cursor, blinks, and
 * while the Bangla caller is speaking its beak moves with the agent's real voice level.
 */

export type VoiceState = {
  level: number;
  phase: "idle" | "connecting" | "waiting" | "live" | "ended" | "error";
  /** true while the agent is talking (from LiveKit's agent state) */
  speaking: boolean;
};

const BLUE = "#5b7cf0";
const BLUE_DARK = "#4562d6";
const BELLY = "#eef2ff";
const FACE = "#a9bbff";
const AMBER = "#ffb02e";
const NAVY = "#141a33";
const BLUSH = "#ff8fb1";

const soft = (color: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  ({ color, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color("#ffffff"), ...extra });

function Bird({ voice }: { voice: React.RefObject<VoiceState> }) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lowerBeak = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group[]>([]);
  const pupils = useRef<THREE.Group[]>([]);
  const wings = useRef<THREE.Group[]>([]);
  const feet = useRef<THREE.Group[]>([]);
  const micTip = useRef<THREE.MeshStandardMaterial>(null);
  const st = useRef({ level: 0, open: 0, blink: 0, nextBlink: 2.5, wave: 0, nextWave: 3, wasInCall: false });

  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime;
    const s = st.current;
    const v = voice.current;
    s.level = THREE.MathUtils.lerp(s.level, Math.min(1, (v?.level ?? 0) * 4), 0.4);
    const speaking = !!v?.speaking || s.level > 0.05;
    const inCall = v?.phase === "live";

    // Beak: syllable-like chatter while the agent talks, wider on louder audio.
    const chatter = speaking ? (0.5 + 0.5 * Math.sin(t * 17)) * (0.55 + 0.45 * Math.abs(Math.sin(t * 5.3))) : 0;
    const targetOpen = speaking ? 0.12 + chatter * 0.42 + s.level * 0.3 : 0.04;
    s.open = THREE.MathUtils.lerp(s.open, targetOpen, 0.45);
    if (lowerBeak.current) lowerBeak.current.rotation.x = s.open;

    // Wave hello every few seconds while idle, and once when a call connects.
    s.nextWave -= dt;
    if (inCall !== s.wasInCall) { s.wasInCall = inCall; if (inCall) s.wave = 1; }
    if (!inCall && s.nextWave <= 0) { s.wave = 1; s.nextWave = 7 + Math.random() * 4; }
    s.wave = Math.max(0, s.wave - dt * 0.6);
    const waving = s.wave > 0 ? Math.sin((1 - s.wave) * Math.PI) : 0;

    wings.current.forEach((w, i) => {
      if (!w) return;
      const side = i ? -1 : 1; // 0 = left wing (viewer's left), 1 = right wing
      let rz = side * (0.18 + Math.sin(t * 1.6 + i) * 0.06); // gentle breathing sway
      if (speaking) rz += side * (0.18 + Math.abs(Math.sin(t * 6 + i * 1.3)) * 0.35); // gesture while talking
      if (i === 1 && waving) rz = -(0.4 + waving * 1.9 + Math.sin(t * 14) * 0.25 * waving); // right wing waves
      w.rotation.z = THREE.MathUtils.lerp(w.rotation.z, rz, 0.18);
    });

    feet.current.forEach((f, i) => {
      if (!f) return;
      const step = speaking ? Math.max(0, Math.sin(t * 6 + i * Math.PI)) * 0.35 : Math.max(0, Math.sin(t * 1.2 + i * Math.PI)) * 0.08;
      f.rotation.x = THREE.MathUtils.lerp(f.rotation.x, -step, 0.25);
    });

    if (head.current) {
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, pointer.x * 0.5, 0.06);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -pointer.y * 0.22 + (speaking ? Math.sin(t * 8) * 0.04 : 0), 0.1);
      const tilt = inCall && !speaking ? 0.14 : waving * 0.12;
      head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, tilt + Math.sin(t * 0.8) * 0.03, 0.06);
    }
    if (root.current) {
      root.current.position.y = speaking ? Math.abs(Math.sin(t * 6)) * 0.05 : Math.abs(Math.sin(t * 1.6)) * 0.02;
      const squash = 1 + (speaking ? Math.sin(t * 12) * 0.012 : 0);
      root.current.scale.set(1 / squash, squash, 1 / squash);
    }

    s.nextBlink -= dt;
    if (s.nextBlink <= 0) { s.blink = 1; s.nextBlink = 2 + Math.random() * 3; }
    s.blink = Math.max(0, s.blink - dt * 7);
    const lid = 1 - Math.sin(s.blink * Math.PI) * 0.92;
    eyes.current.forEach((e) => e && (e.scale.y = lid));
    pupils.current.forEach((p) => {
      if (!p) return;
      p.position.x = THREE.MathUtils.lerp(p.position.x, pointer.x * 0.07, 0.12);
      p.position.y = THREE.MathUtils.lerp(p.position.y, pointer.y * 0.06, 0.12);
    });
    if (micTip.current) micTip.current.emissiveIntensity = 0.5 + (speaking ? 2 + s.level * 5 : 0) + (inCall ? 0.6 : 0);
  });

  return (
    <group ref={root}>
      {/* small round body (chibi proportions: big head, little body) */}
      <mesh castShadow position={[0, -1.12, 0]} scale={[0.82, 0.74, 0.76]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhysicalMaterial {...soft(BLUE)} />
      </mesh>
      <mesh position={[0, -1.16, 0.4]} scale={[0.56, 0.54, 0.42]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshPhysicalMaterial {...soft(BELLY, { clearcoat: 0.2 })} />
      </mesh>
      {/* little yellow bow tie */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.09, -0.62, 0.7]} rotation={[0.3, 0, side * Math.PI / 2]}>
          <coneGeometry args={[0.08, 0.16, 3]} />
          <meshStandardMaterial color={AMBER} roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, -0.62, 0.73]}><sphereGeometry args={[0.045, 16, 16]} /><meshStandardMaterial color="#e89510" /></mesh>

      {/* wings: pivot at the shoulder so they swing like arms */}
      {[-1, 1].map((side, i) => (
        <group key={side} ref={(g) => { if (g) wings.current[i] = g; }} position={[side * 0.68, -0.85, 0.05]}>
          <mesh castShadow position={[side * 0.12, -0.32, 0]} scale={[0.17, 0.4, 0.3]} rotation={[0, 0, side * 0.25]}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshPhysicalMaterial {...soft(BLUE_DARK)} />
          </mesh>
        </group>
      ))}

      {/* feet: pivot at the hip so they can tap */}
      {[-1, 1].map((side, i) => (
        <group key={side} ref={(g) => { if (g) feet.current[i] = g; }} position={[side * 0.3, -1.72, 0.18]}>
          <mesh position={[0, -0.06, 0.16]} scale={[0.2, 0.08, 0.27]}>
            <sphereGeometry args={[1, 24, 24]} />
            <meshPhysicalMaterial {...soft(AMBER)} />
          </mesh>
        </group>
      ))}

      {/* head */}
      <group ref={head} position={[0, 0.3, 0]}>
        <mesh castShadow scale={[1.08, 1, 1]}>
          <sphereGeometry args={[1.05, 64, 64]} />
          <meshPhysicalMaterial {...soft(BLUE)} />
        </mesh>
        <mesh position={[0, -0.12, 0.55]} scale={[0.82, 0.66, 0.52]}>
          <sphereGeometry args={[1, 48, 48]} />
          <meshPhysicalMaterial {...soft(FACE, { clearcoat: 0.3 })} />
        </mesh>
        {/* fluffy crest */}
        {[[-0.2, -0.45, 0.32], [0, 0, 0.42], [0.2, 0.45, 0.32]].map(([x, rz, h], i) => (
          <mesh key={i} position={[x, 1.06 - Math.abs(x) * 0.4, 0.05]} rotation={[-0.25, 0, rz]}>
            <capsuleGeometry args={[0.07, h, 8, 16]} />
            <meshPhysicalMaterial {...soft(BLUE_DARK)} />
          </mesh>
        ))}
        {/* big sparkly eyes behind round glasses */}
        {[-1, 1].map((side, i) => (
          <group key={side} position={[side * 0.38, 0.14, 0.98]}>
            <group ref={(g) => { if (g) eyes.current[i] = g; }}>
              <mesh scale={[1, 1.08, 0.55]}>
                <sphereGeometry args={[0.27, 32, 32]} />
                <meshStandardMaterial color="#ffffff" roughness={0.15} />
              </mesh>
              <group ref={(g) => { if (g) pupils.current[i] = g; }} position={[0, 0, 0]}>
                <mesh position={[0, -0.02, 0.11]} scale={[1, 1.1, 0.7]}>
                  <sphereGeometry args={[0.16, 24, 24]} />
                  <meshStandardMaterial color={NAVY} roughness={0.1} />
                </mesh>
                <mesh position={[0.06, 0.06, 0.24]}><sphereGeometry args={[0.05, 12, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
                <mesh position={[-0.05, -0.07, 0.23]}><sphereGeometry args={[0.025, 12, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
              </group>
            </group>
            <mesh position={[0, 0, 0.12]}>
              <torusGeometry args={[0.32, 0.03, 16, 48]} />
              <meshStandardMaterial color={NAVY} metalness={0.5} roughness={0.3} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.17, 1.11]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
          <meshStandardMaterial color={NAVY} metalness={0.5} roughness={0.3} />
        </mesh>
        {/* rosy cheeks */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.62, -0.28, 0.82]} scale={[0.16, 0.1, 0.05]}>
            <sphereGeometry args={[1, 24, 24]} />
            <meshStandardMaterial color={BLUSH} transparent opacity={0.55} roughness={0.8} />
          </mesh>
        ))}
        {/* small beak; the lower half opens when Byte talks */}
        <mesh position={[0, -0.24, 1.08]} rotation={[Math.PI / 2 - 0.2, 0, 0]}>
          <coneGeometry args={[0.13, 0.26, 32]} />
          <meshPhysicalMaterial {...soft(AMBER, { clearcoat: 0.9 })} />
        </mesh>
        <group ref={lowerBeak} position={[0, -0.31, 1.0]}>
          <mesh position={[0, -0.01, 0.08]} rotation={[Math.PI / 2 + 0.1, 0, 0]} scale={[1, 1, 0.55]}>
            <coneGeometry args={[0.11, 0.2, 32]} />
            <meshPhysicalMaterial {...soft("#f0960f")} />
          </mesh>
        </group>
        {/* headset */}
        <mesh position={[0, 0.05, 0]} scale={[1.08, 1, 1]}>
          <torusGeometry args={[1.08, 0.06, 16, 64, Math.PI]} />
          <meshStandardMaterial color="#232a4a" metalness={0.4} roughness={0.35} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 1.15, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.2, 32]} />
            <meshStandardMaterial color="#232a4a" metalness={0.3} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[-0.82, -0.42, 0.72]} rotation={[0.95, 0.9, 0.55]}>
          <cylinderGeometry args={[0.022, 0.022, 0.85, 8]} />
          <meshStandardMaterial color="#232a4a" />
        </mesh>
        <mesh position={[-0.42, -0.62, 1.0]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial ref={micTip} color={AMBER} emissive={AMBER} emissiveIntensity={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Rings that pulse around Byte during a call (spin while connecting). */
function VoiceRings({ voice }: { voice: React.RefObject<VoiceState> }) {
  const group = useRef<THREE.Group>(null);
  const rings = useMemo(() => [0, 1, 2], []);
  useFrame(({ clock }) => {
    const v = voice.current;
    const g = group.current;
    if (!g || !v) return;
    const t = clock.elapsedTime;
    const active = v.phase === "live" || v.phase === "connecting" || v.phase === "waiting";
    g.children.forEach((child, i) => {
      const m = child as THREE.Mesh;
      const mat = m.material as THREE.MeshBasicMaterial;
      if (v.phase === "live") {
        const p = (t * 0.6 + i / 3) % 1;
        m.scale.setScalar(1.6 + p * 1.2 + v.level * 1.5);
        mat.opacity = (1 - p) * (0.15 + v.level * 1.2);
        m.rotation.z = 0;
      } else if (active) {
        m.scale.setScalar(1.8 + i * 0.25);
        m.rotation.z = t * (1.5 + i * 0.4) * (i % 2 ? -1 : 1);
        mat.opacity = 0.35;
      } else {
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0, 0.1);
      }
    });
  });
  return (
    <group ref={group} position={[0, -0.35, -0.6]}>
      {rings.map((i) => (
        <mesh key={i}>
          <torusGeometry args={[1, 0.012, 8, 96, i === 0 ? Math.PI * 2 : Math.PI * 1.3]} />
          <meshBasicMaterial color={AMBER} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function ByteMascot({ voice }: { voice: React.RefObject<VoiceState> }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 6.2], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      aria-label="Byte, the ByteVoice mascot, in 3D"
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#bcd0ff", "#1a1030", 0.6]} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} castShadow />
      <pointLight position={[-4, 1, -2]} intensity={25} color="#ffb347" />
      <pointLight position={[3, -2, 3]} intensity={8} color="#7aa2ff" />
      <Float speed={1.6} rotationIntensity={0.12} floatIntensity={0.5}>
        <group position={[0, 0.35, 0]}>
          <Bird voice={voice} />
          <VoiceRings voice={voice} />
        </group>
      </Float>
      <ContactShadows position={[0, -1.6, 0]} opacity={0.45} scale={6} blur={2.6} far={3} color="#000010" />
      <Sparkles count={40} scale={[6, 4, 3]} size={2.2} speed={0.3} color="#ffd58a" opacity={0.6} />
    </Canvas>
  );
}
