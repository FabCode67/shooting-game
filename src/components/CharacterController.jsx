import { Billboard, CameraControls, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, vec3 } from "@react-three/rapier";
import { isHost } from "playroomkit";
import { useEffect, useRef, useState } from "react";
import { CharacterSoldier } from "./CharacterSoldier";
const MOVEMENT_SPEED = 250; // Increased for faster running
const FIRE_RATE = 380;
export const WEAPON_OFFSET = {
  x: -0.2,
  y: 1.4,
  z: 0.8,
};

export const CharacterController = ({
  state,
  joystick,
  userPlayer,
  onKilled,
  onFire,
  downgradedPerformance,
  ...props
}) => {
  const group = useRef();
  const character = useRef();
  const rigidbody = useRef();
  const [animation, setAnimation] = useState("Idle");
  const [weapon, setWeapon] = useState("AK");
  const lastShoot = useRef(0);

  const scene = useThree((state) => state.scene);
  const spawnRandomly = () => {
    const spawns = [];
    for (let i = 0; i < 1000; i++) {
      const spawn = scene.getObjectByName(`spawn_${i}`);
      if (spawn) {
        spawns.push(spawn);
      } else {
        break;
      }
    }
    const spawnPos = spawns[Math.floor(Math.random() * spawns.length)].position;
    rigidbody.current.setTranslation(spawnPos);
  };

  useEffect(() => {
    if (isHost()) {
      spawnRandomly();
    }
  }, []);

  useEffect(() => {
    if (state.state.dead) {
      const audio = new Audio("/audios/dead.mp3");
      audio.volume = 0.5;
      audio.play();
    }
  }, [state.state.dead]);

  useEffect(() => {
    if (state.state.health < 100) {
      const audio = new Audio("/audios/hurt.mp3");
      audio.volume = 0.4;
      audio.play();
    }
  }, [state.state.health]);

  useFrame((_, delta) => {
    // CAMERA FOLLOW
    if (controls.current) {
      const cameraDistanceY = window.innerWidth < 1024 ? 16 : 20;
      const cameraDistanceZ = window.innerWidth < 1024 ? 12 : 16;
      const playerWorldPos = vec3(rigidbody.current.translation());
      controls.current.setLookAt(
        playerWorldPos.x,
        playerWorldPos.y + (state.state.dead ? 12 : cameraDistanceY),
        playerWorldPos.z + (state.state.dead ? 2 : cameraDistanceZ),
        playerWorldPos.x,
        playerWorldPos.y + 1.5,
        playerWorldPos.z,
        true
      );
    }

    if (state.state.dead) {
      setAnimation("Death");
      return;
    }

    // Update player position based on joystick state
    const angle = joystick.angle();
    if (joystick.isJoystickPressed() && angle) {
      setAnimation("Run");
      
      // Implement smooth turning with limited rotation speed
      const currentRotation = character.current.rotation.y;
      const targetRotation = angle;
      
      // Calculate the shortest angle difference (accounting for wrapping)
      let angleDiff = targetRotation - currentRotation;
      if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      // Limit rotation speed (lower value = slower turning)
      const maxRotationPerFrame = 1.2 * delta; // Decreased turning speed
      const clampedAngleDiff = Math.max(
        -maxRotationPerFrame,
        Math.min(maxRotationPerFrame, angleDiff)
      );
      
      // Apply the limited rotation
      character.current.rotation.y = currentRotation + clampedAngleDiff;

      // move character in its own direction (based on current rotation, not target angle)
      const movementAngle = character.current.rotation.y;
      const impulse = {
        x: Math.sin(movementAngle) * MOVEMENT_SPEED * delta,
        y: 0,
        z: Math.cos(movementAngle) * MOVEMENT_SPEED * delta,
      };

      rigidbody.current.applyImpulse(impulse, true);
    } else {
      setAnimation("Idle");
    }

    // Check if fire button is pressed
    if (joystick.isPressed("fire")) {
      // fire
      setAnimation(
        joystick.isJoystickPressed() && angle ? "Run_Shoot" : "Idle_Shoot"
      );
      
      // When shooting, also apply the same slow turning logic
      if (angle) {
        const currentRotation = character.current.rotation.y;
        const targetRotation = angle;
        
        // Calculate the shortest angle difference (accounting for wrapping)
        let angleDiff = targetRotation - currentRotation;
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Limit rotation speed
        const maxRotationPerFrame = 1.0 * delta; // Even slower turning when aiming
        const clampedAngleDiff = Math.max(
          -maxRotationPerFrame,
          Math.min(maxRotationPerFrame, angleDiff)
        );
        
        // Apply the limited rotation
        character.current.rotation.y = currentRotation + clampedAngleDiff;
      }
      
      if (isHost()) {
        if (Date.now() - lastShoot.current > FIRE_RATE) {
          lastShoot.current = Date.now();
          const newBullet = {
            id: state.id + "-" + +new Date(),
            position: vec3(rigidbody.current.translation()),
            angle: character.current.rotation.y, // Use actual character rotation, not joystick angle
            player: state.id,
          };
          onFire(newBullet);
        }
      }
    }

    if (isHost()) {
      state.setState("pos", rigidbody.current.translation());
    } else {
      const pos = state.getState("pos");
      if (pos) {
        rigidbody.current.setTranslation(pos);
      }
    }
  });
  const controls = useRef();
  const directionalLight = useRef();

  useEffect(() => {
    if (character.current && userPlayer) {
      directionalLight.current.target = character.current;
    }
  }, [character.current]);

  return (
    <group {...props} ref={group}>
      {userPlayer && <CameraControls ref={controls} />}
      <RigidBody
        ref={rigidbody}
        colliders={false}
        linearDamping={12}
        lockRotations
        type={isHost() ? "dynamic" : "kinematicPosition"}
        onIntersectionEnter={({ other }) => {
        if (
        isHost() &&
        other.rigidBody.userData.type === "bullet" &&
        state.state.health > 0
        ) {
        // Initialize hits if not already set
        const currentHits = state.state.hits || 0;
        // Increment hit counter
        const newHits = currentHits + 1;
        state.setState("hits", newHits);
        
        // Apply damage to health bar for visual feedback
        const newHealth = state.state.health - other.rigidBody.userData.damage;
        state.setState("health", newHealth);
        
        // Kill opponent after 3 hits
        if (newHits >= 3) {
        state.setState("deaths", state.state.deaths + 1);
        state.setState("dead", true);
          state.setState("health", 0);
        rigidbody.current.setEnabled(false);
          setTimeout(() => {
              spawnRandomly();
                rigidbody.current.setEnabled(true);
                state.setState("health", 100);
                state.setState("dead", false);
                // Reset hit counter on respawn
                state.setState("hits", 0);
              }, 2000);
              onKilled(state.id, other.rigidBody.userData.player);
            }
          }
        }}
      >
        <PlayerInfo state={state.state} />
        <group ref={character}>
          <CharacterSoldier
            color={state.state.profile?.color}
            animation={animation}
            weapon={weapon}
          />
          {userPlayer && (
            <Crosshair
              position={[WEAPON_OFFSET.x, WEAPON_OFFSET.y, WEAPON_OFFSET.z]}
            />
          )}
        </group>
        {userPlayer && (
          // Finally I moved the light to follow the player
          // This way we won't need to calculate ALL the shadows but only the ones
          // that are in the camera view
          <directionalLight
            ref={directionalLight}
            position={[25, 18, -25]}
            intensity={0.3}
            castShadow={!downgradedPerformance} // Disable shadows on low-end devices
            shadow-camera-near={0}
            shadow-camera-far={100}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0001}
          />
        )}
        <CapsuleCollider args={[1.0, 0.8]} position={[0, 1.28, 0]} /> {/* Increased collision size for easier targeting */}
      </RigidBody>
    </group>
  );
};

const PlayerInfo = ({ state }) => {
  const health = state.health;
  const name = state.profile.name;
  const hits = state.hits || 0;
  
  return (
    <Billboard position-y={2.5}>
      <Text position-y={0.36} fontSize={0.4}>
        {name} {hits > 0 ? `[${hits}/3]` : ''}
        <meshBasicMaterial color={state.profile.color} />
      </Text>
      <mesh position-z={-0.1}>
        <planeGeometry args={[1, 0.2]} />
        <meshBasicMaterial color="black" transparent opacity={0.5} />
      </mesh>
      <mesh scale-x={health / 100} position-x={-0.5 * (1 - health / 100)}>
        <planeGeometry args={[1, 0.2]} />
        <meshBasicMaterial color="red" />
      </mesh>
    </Billboard>
  );
};

const Crosshair = (props) => {
  return (
    <group {...props}>
      {/* Enhanced crosshair with larger, more visible elements */}
      <mesh position-z={1}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshBasicMaterial color="red" transparent opacity={0.9} />
      </mesh>
      <mesh position-z={2}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshBasicMaterial color="red" transparent opacity={0.85} />
      </mesh>
      <mesh position-z={3}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshBasicMaterial color="red" transparent opacity={0.8} />
      </mesh>

      <mesh position-z={4.5}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshBasicMaterial color="red" opacity={0.7} transparent />
      </mesh>

      <mesh position-z={6.5}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshBasicMaterial color="red" opacity={0.6} transparent />
      </mesh>

      <mesh position-z={9}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshBasicMaterial color="red" opacity={0.4} transparent />
      </mesh>
      
      {/* Add a targeting circle at mid-range for better visual guidance */}
      <mesh position-z={5}>
        <ringGeometry args={[0.2, 0.22, 16]} />
        <meshBasicMaterial color="red" opacity={0.5} transparent />
      </mesh>
    </group>
  );
};
