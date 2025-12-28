import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { VRButton } from "https://unpkg.com/three@0.160.0/examples/jsm/webxr/VRButton.js";

const canvasContainer = document.body;
const overlay = document.getElementById("overlay");
const gravityInput = document.getElementById("gravity");
const frictionInput = document.getElementById("friction");
const gravityValue = document.getElementById("gravityValue");
const frictionValue = document.getElementById("frictionValue");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  200
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
canvasContainer.appendChild(renderer.domElement);

const vrButton = VRButton.createButton(renderer);
const vrButtonContainer = document.getElementById("vr-button");
vrButtonContainer.appendChild(vrButton);

const playerRig = new THREE.Group();
playerRig.add(camera);
scene.add(playerRig);

const colliders = [];
const lights = new THREE.Group();

const hemiLight = new THREE.HemisphereLight(0xdde7ff, 0x1c1f2b, 0.8);
lights.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 8, 6);
lights.add(dirLight);
scene.add(lights);

const floorGeometry = new THREE.PlaneGeometry(50, 50);
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x182031,
  roughness: 0.8,
  metalness: 0.1,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
colliders.push(floor);

const shapeMaterial = new THREE.MeshStandardMaterial({
  color: 0x4a8dff,
  roughness: 0.45,
  metalness: 0.2,
});

const shapes = [
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.SphereGeometry(1, 32, 32),
  new THREE.CylinderGeometry(0.9, 0.9, 2, 28),
  new THREE.DodecahedronGeometry(1.1),
];

for (let i = 0; i < 16; i += 1) {
  const geometry = shapes[i % shapes.length];
  const mesh = new THREE.Mesh(geometry, shapeMaterial.clone());
  mesh.material.color.setHSL(0.55 + i * 0.02, 0.75, 0.55);
  mesh.position.set(
    (Math.random() - 0.5) * 16,
    1 + Math.random() * 4,
    (Math.random() - 0.5) * 16
  );
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  scene.add(mesh);
  colliders.push(mesh);
}

colliders.forEach((mesh) => {
  if (mesh.geometry && !mesh.geometry.boundingSphere) {
    mesh.geometry.computeBoundingSphere();
  }
});

const controllerStates = [0, 1].map((index) => {
  const controller = renderer.xr.getController(index);
  playerRig.add(controller);

  const handMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffb347 })
  );
  controller.add(handMesh);

  return {
    controller,
    selecting: false,
    prevWorldPos: new THREE.Vector3(),
    releaseVelocity: new THREE.Vector3(),
  };
});

controllerStates.forEach((state) => {
  state.controller.addEventListener("selectstart", () => {
    state.selecting = true;
    state.controller.getWorldPosition(state.prevWorldPos);
    state.releaseVelocity.set(0, 0, 0);
  });

  state.controller.addEventListener("selectend", () => {
    state.selecting = false;
    playerVelocity.add(state.releaseVelocity);
  });
});

const playerVelocity = new THREE.Vector3();
let lastTime = 0;

const controllerWorldPosition = new THREE.Vector3();
const colliderWorldPosition = new THREE.Vector3();

const gravity = {
  value: Number.parseFloat(gravityInput.value),
};
const friction = {
  value: Number.parseFloat(frictionInput.value),
};

const updateSliderLabels = () => {
  gravityValue.textContent = gravity.value.toFixed(1);
  frictionValue.textContent = friction.value.toFixed(3);
};

updateSliderLabels();

gravityInput.addEventListener("input", () => {
  gravity.value = Number.parseFloat(gravityInput.value);
  updateSliderLabels();
});

frictionInput.addEventListener("input", () => {
  friction.value = Number.parseFloat(frictionInput.value);
  updateSliderLabels();
});

const isTouchingSurface = (position) => {
  if (position.y <= 0.12) {
    return true;
  }

  for (const mesh of colliders) {
    if (!mesh.geometry?.boundingSphere) {
      continue;
    }
    mesh.getWorldPosition(colliderWorldPosition);
    const radius = mesh.geometry.boundingSphere.radius * mesh.scale.length();
    if (position.distanceTo(colliderWorldPosition) <= radius + 0.12) {
      return true;
    }
  }

  return false;
};

const applyControllerMovement = (deltaTime) => {
  controllerStates.forEach((state) => {
    if (!state.selecting) {
      return;
    }

    state.controller.getWorldPosition(controllerWorldPosition);

    if (!isTouchingSurface(controllerWorldPosition)) {
      state.prevWorldPos.copy(controllerWorldPosition);
      state.releaseVelocity.set(0, 0, 0);
      return;
    }

    const delta = controllerWorldPosition
      .clone()
      .sub(state.prevWorldPos);

    if (delta.lengthSq() > 0) {
      playerRig.position.addScaledVector(delta, -1);
      state.releaseVelocity.copy(delta).divideScalar(Math.max(deltaTime, 0.001));
    }

    state.prevWorldPos.copy(controllerWorldPosition);
  });
};

const applyPhysics = (deltaTime) => {
  playerVelocity.y += gravity.value * deltaTime;

  playerRig.position.addScaledVector(playerVelocity, deltaTime);

  if (playerRig.position.y < 0) {
    playerRig.position.y = 0;
    if (playerVelocity.y < 0) {
      playerVelocity.y = 0;
    }

    const horizontalVelocity = new THREE.Vector3(
      playerVelocity.x,
      0,
      playerVelocity.z
    );
    const speed = horizontalVelocity.length();
    if (speed > 0) {
      const drop = Math.min(speed, friction.value * 60 * deltaTime);
      horizontalVelocity.multiplyScalar((speed - drop) / speed);
      playerVelocity.x = horizontalVelocity.x;
      playerVelocity.z = horizontalVelocity.z;
    }
  }
};

const animate = (time) => {
  const deltaTime = Math.min((time - lastTime) / 1000, 0.032);
  lastTime = time;

  applyControllerMovement(deltaTime);
  applyPhysics(deltaTime);

  renderer.render(scene, camera);
};

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyH") {
    overlay.style.display = overlay.style.display === "none" ? "block" : "none";
  }
});
