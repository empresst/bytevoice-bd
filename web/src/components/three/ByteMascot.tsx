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

export type VoiceState = { level: number; phase: "idle" | "connecting" | "waiting" | "live" | "ended" | "error" };

const BLUE = "#5470d6";
const BLUE_DARK = "#3c54b4";
const BELLY = "#dfe6ff";
const AMBER = "#f5a623";
const NAVY = "#141a33";

function Bird({ voice }: { voice: React.RefObject<VoiceState> }) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lowerBeak = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group[]>([]);
  const pupils = useRef<THREE.Mesh[]>([]);
  const wings = useRef<THREE.Mesh[]>([]);
  const micTip = useRef<THREE.MeshStandardMaterial>(null);
  const smooth = useRef({ level: 0, blink: 0, nextBlink: 2.5 });

  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime;
    const s = smooth.current;
    const v = voice.current;
    s.level = THREE.MathUtils.lerp(s.level, Math.min(1, (v?.level ?? 0) * 3.5), 0.35);
    const talking = s.level > 0.04;

    if (head.current) {
      // Look toward the cursor; tilt the head a little while listening on a call.
      const listen = v?.phase === "live" && !talking ? 0.12 : 0;
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, pointer.x * 0.55, 0.06);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -pointer.y * 0.25 + (talking ? Math.sin(t * 9) * 0.03 : 0), 0.08);
      head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, listen + Math.sin(t * 0.8) * 0.03, 0.05);
    }
    if (root.current) {
      root.current.scale.setScalar(1 + s.level * 0.04);
      root.current.position.y = talking ? Math.abs(Math.sin(t * 8)) * 0.04 * s.level : 0;
    }
    if (lowerBeak.current) lowerBeak.current.rotation.x = THREE.MathUtils.lerp(lowerBeak.current.rotation.x, 0.08 + s.level * 0.55, 0.5);

    // Blink every few seconds.
    s.nextBlink -= dt;
    if (s.nextBlink <= 0) { s.blink = 1; s.nextBlink = 2 + Math.random() * 3; }
    s.blink = Math.max(0, s.blink - dt * 7);
    const lid = 1 - Math.sin(s.blink * Math.PI) * 0.9;
    eyes.current.forEach((e) => e && (e.scale.y = lid));
    pupils.current.forEach((p) => {
      if (!p) return;
      p.position.x = THREE.MathUtils.lerp(p.position.x, pointer.x * 0.06, 0.1);
      p.position.y = THREE.MathUtils.lerp(p.position.y, pointer.y * 0.05, 0.1);
    });
    wings.current.forEach((w, i) => w && (w.rotation.z = (i ? -1 : 1) * (0.25 + (talking ? Math.sin(t * 10) * 0.12 * s.level : Math.sin(t * 1.5) * 0.04))));
    if (micTip.current) micTip.current.emissiveIntensity = 0.4 + s.level * 6 + (v?.phase === "live" ? 0.6 : 0);
  });

  const physical = (color: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    ({ color, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.35, ...extra });

  return (
    <group ref={root}>
      {/* body */}
      <mesh castShadow position={[0, -1.05, 0]} scale={[0.95, 0.85, 0.85]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhysicalMaterial {...physical(BLUE)} />
      </mesh>
      <mesh position={[0, -1.1, 0.42]} scale={[0.62, 0.62, 0.5]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshPhysicalMaterial {...physical(BELLY, { clearcoat: 0.2 })} />
      </mesh>
      {/* yellow tie, like Byte's suit */}
      <mesh position={[0, -0.62, 0.8]} rotation={[0.25, 0, Math.PI / 4]} scale={[0.11, 0.11, 0.05]}>
        <boxGeometry />
        <meshStandardMaterial color={AMBER} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.86, 0.79]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[0.1, 0.38, 4]} />
        <meshStandardMaterial color={AMBER} roughness={0.5} />
      </mesh>
      {/* wings */}
      {[-1, 1].map((side, i) => (
        <mesh key={side} ref={(m) => { if (m) wings.current[i] = m; }} position={[side * 0.88, -1.05, 0.05]} scale={[0.22, 0.55, 0.45]} castShadow>
          <sphereGeometry args={[1, 32, 32]} />
          <meshPhysicalMaterial {...physical(BLUE_DARK)} />
        </mesh>
      ))}
      {/* feet */}
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x, -1.85, 0.35]} scale={[0.22, 0.08, 0.3]}>
          <sphereGeometry args={[1, 24, 24]} />
          <meshStandardMaterial color={AMBER} roughness={0.6} />
        </mesh>
      ))}

      {/* head */}
      <group ref={head} position={[0, 0.25, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[1, 64, 64]} />
          <meshPhysicalMaterial {...physical(BLUE)} />
        </mesh>
        {/* face patch */}
        <mesh position={[0, -0.05, 0.55]} scale={[0.75, 0.6, 0.5]}>
          <sphereGeometry args={[1, 48, 48]} />
          <meshPhysicalMaterial {...physical("#8fa3f0", { clearcoat: 0.3 })} />
        </mesh>
        {/* crest */}
        {[[-0.18, -0.35], [0, 0], [0.18, 0.35]].map(([x, rz], i) => (
          <mesh key={i} position={[x, 1.05 - Math.abs(x) * 0.6, 0.1]} rotation={[-0.2, 0, rz]}>
            <coneGeometry args={[0.09, 0.42, 16]} />
            <meshPhysicalMaterial {...physical(BLUE_DARK)} />
          </mesh>
        ))}
        {/* eyes with glasses */}
        {[-1, 1].map((side, i) => (
          <group key={side} position={[side * 0.34, 0.2, 0.98]}>
            <group ref={(g) => { if (g) eyes.current[i] = g; }}>
              <mesh scale={[1, 1, 0.6]}>
                <sphereGeometry args={[0.23, 32, 32]} />
                <meshStandardMaterial color="#ffffff" roughness={0.2} />
              </mesh>
              <mesh ref={(m) => { if (m) pupils.current[i] = m; }} position={[0, 0, 0.12]}>
                <sphereGeometry args={[0.11, 24, 24]} />
                <meshStandardMaterial color={NAVY} roughness={0.15} />
              </mesh>
              <mesh position={[0.05, 0.06, 0.2]}>
                <sphereGeometry args={[0.035, 12, 12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
            <mesh position={[0, 0, 0.1]}>
              <torusGeometry args={[0.28, 0.035, 16, 48]} />
              <meshStandardMaterial color={NAVY} metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.22, 1.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 0.16, 8]} />
          <meshStandardMaterial color={NAVY} metalness={0.6} roughness={0.3} />
        </mesh>
        {/* beak: the lower half opens with the voice */}
        <mesh position={[0, -0.14, 1.12]} rotation={[Math.PI / 2 - 0.15, 0, 0]}>
          <coneGeometry args={[0.19, 0.42, 32]} />
          <meshPhysicalMaterial {...physical(AMBER, { clearcoat: 0.8 })} />
        </mesh>
        <group ref={lowerBeak} position={[0, -0.24, 1.0]}>
          <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2 + 0.1, 0, 0]} scale={[1, 1, 0.6]}>
            <coneGeometry args={[0.15, 0.3, 32]} />
            <meshPhysicalMaterial {...physical("#e08e10")} />
          </mesh>
        </group>
        {/* headset */}
        <mesh position={[0, 0.05, 0]}>
          <torusGeometry args={[1.04, 0.06, 16, 64, Math.PI]} />
          <meshStandardMaterial color="#1f2540" metalness={0.5} roughness={0.35} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 1.02, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.2, 32]} />
            <meshStandardMaterial color="#1f2540" metalness={0.4} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[-0.7, -0.42, 0.72]} rotation={[0.95, 0.9, 0.55]}>
          <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
          <meshStandardMaterial color="#1f2540" />
        </mesh>
        <mesh position={[-0.38, -0.58, 1.02]}>
          <sphereGeometry args={[0.075, 16, 16]} />
          <meshStandardMaterial ref={micTip} color={AMBER} emissive={AMBER} emissiveIntensity={0.4} />
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
      <ContactShadows position={[0, -1.75, 0]} opacity={0.45} scale={6} blur={2.6} far={3} color="#000010" />
      <Sparkles count={40} scale={[6, 4, 3]} size={2.2} speed={0.3} color="#ffd58a" opacity={0.6} />
    </Canvas>
  );
}
