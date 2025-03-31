import { weaponSystem } from '../weapons/index.js';
import { elements } from './elements.js';
import { MobileControlsManager } from '../mobileControls/MobileControlsManager.js'; // Import MobileControlsManager

export function createWeaponSystem() {
  // Only create desktop weapon UI if not on a touch device
  if (!MobileControlsManager.isTouchDevice) {
    // Create a combined weapons container for desktop
    const weaponsContainer = document.createElement('div');
    weaponsContainer.className = 'weapons-container bottom-element';

    // Create a section for secondary weapon
  const secondarySection = createWeaponSection('SECONDARY', 'R <span class="key-hint">Fire</span> | <span class="key-hint">Tab</span> Switch');

  // Add divider
  const divider = document.createElement('div');
  divider.className = 'weapon-divider';

  // Create a section for primary weapon
  const primarySection = createWeaponSection('PRIMARY', 'LMB <span class="key-hint">Fire</span> | <span class="key-hint">Scroll</span> Switch');

  // Add all sections to the container
  weaponsContainer.appendChild(secondarySection.container);
    weaponsContainer.appendChild(divider);
    weaponsContainer.appendChild(primarySection.container);

    // Add to HUD
    elements.container.appendChild(weaponsContainer);

    // Store references to both weapon sections for desktop
    elements.primaryWeapon = primarySection;
    elements.secondaryWeapon = secondarySection;
  }
  // Mobile weapon UI is handled entirely by MobileControlsManager creating widgets
  // and updateWeaponDisplay populating them.
}


// This function remains largely the same, creating the structure for a weapon section
// It's used by createWeaponSystem for the desktop view.
function createWeaponSection(label, keyBindingText) {
  // Create section container
  const sectionContainer = document.createElement('div');
  sectionContainer.className = `weapon-section ${label.toLowerCase()}-section`;

  // Container header with weapon type label
  const containerHeader = document.createElement('div');
  containerHeader.className = 'weapon-header';
  containerHeader.textContent = label;
  sectionContainer.appendChild(containerHeader);

  // Create weapon display row
  const weaponRow = document.createElement('div');
  weaponRow.className = 'weapon-row';

  // Weapon icon
  const weaponIcon = document.createElement('div');
  weaponIcon.className = 'status-icon weapon-icon';
  weaponIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7,5H23V9H22V10H16V9H15V5H7V9H6V10H2V9H1V5H7M6,13H7V17H8V22H4V17H5V13H6M16,13H17V17H18V22H14V17H15V13H16Z"></path></svg>';
  weaponRow.appendChild(weaponIcon);

  // Weapon info container
  const weaponInfo = document.createElement('div');
  weaponInfo.className = 'weapon-info';

  // Weapon status and name
  const statusAndNameRow = document.createElement('div');
  statusAndNameRow.className = 'status-name-row';

  // Weapon status
  const weaponStatus = document.createElement('div');
  weaponStatus.className = 'weapon-status';
  weaponStatus.innerHTML = '<span class="status-inactive">NO WEAPON</span>';
  statusAndNameRow.appendChild(weaponStatus);

  // Current weapon name
  const weaponName = document.createElement('div');
  weaponName.className = 'weapon-name';
  weaponName.textContent = 'None';
  statusAndNameRow.appendChild(weaponName);

  weaponInfo.appendChild(statusAndNameRow);

  // Next weapon info
  const nextWeapon = document.createElement('div');
  nextWeapon.className = 'next-weapon';
  nextWeapon.innerHTML = '';
  weaponInfo.appendChild(nextWeapon);

  weaponRow.appendChild(weaponInfo);

  // Ammo and cooldown container
  const ammoContainer = document.createElement('div');
  ammoContainer.className = 'ammo-cooldown-container';

  // Ammo counter
  const ammoCounter = document.createElement('div');
  ammoCounter.className = 'ammo-counter';
  ammoCounter.textContent = '0/0';
  ammoContainer.appendChild(ammoCounter);

  // Ammo segments
  const ammoSegments = document.createElement('div');
  ammoSegments.className = 'ammo-segments';
  for (let i = 0; i < 10; i++) {
    const segment = document.createElement('div');
    segment.className = 'segment';
    ammoSegments.appendChild(segment);
  }
  ammoContainer.appendChild(ammoSegments);

  // Cooldown bar
  const cooldownBar = document.createElement('div');
  cooldownBar.className = 'cooldown-bar';
  ammoContainer.appendChild(cooldownBar);

  // Key binding indicator
  const keyBinding = document.createElement('div');
  keyBinding.className = 'key-binding';
  keyBinding.innerHTML = keyBindingText;
  ammoContainer.appendChild(keyBinding);

  // Add elements to section
  sectionContainer.appendChild(weaponRow);
  sectionContainer.appendChild(ammoContainer);

  // Return an object with references to the elements
  return {
    container: sectionContainer,
    status: weaponStatus,
    name: weaponName,
    nextWeapon: nextWeapon,
    ammoCounter: ammoCounter,
    ammoSegments: ammoSegments,
    cooldownBar: cooldownBar,
    icon: weaponIcon
  };
}

export function updateWeaponStatus() {
  // Update weapon displays
  updateWeaponDisplay('primary');
  updateWeaponDisplay('secondary');
}

export function updateWeaponDisplay(mountType) {
  // Get the correct weapon display based on type
  const display = mountType === 'primary' ? elements.primaryWeapon : elements.secondaryWeapon;

  // Get currently selected weapon of this type
  const weapon = weaponSystem.getSelectedWeapon(mountType);

  if (weapon) {
    // Get mount point and cooldown status
    const mounts = weaponSystem.mountManager.getAllMounts();
    const mount = mounts.find(m => m.getWeapon()?.id === weapon.id);
    if (!mount) return;

    const now = Date.now();
    const timeSinceLastFire = now - mount.lastFireTime;
    const cooldownTime = 1000 / weapon.config.fireRate;
    const cooldownPercent = Math.min(100, (timeSinceLastFire / cooldownTime) * 100);

    // Update weapon name
    display.name.textContent = weapon.config.displayName || weapon.type;

    // Update weapon ready status
    if (weapon.ammo <= 0) {
      display.status.innerHTML = '<span class="status-inactive">NO AMMO</span>';
    } else if (cooldownPercent < 100) {
      display.status.innerHTML = '<span class="status-charging">CHARGING</span>';
    } else {
      display.status.innerHTML = '<span class="status-active">READY</span>';
    }

    // Update ammo counter
    display.ammoCounter.textContent = `${weapon.ammo}/${weapon.maxAmmo}`;

    // Update ammo segments
    const ammoPercent = (weapon.ammo / weapon.maxAmmo) * 100;
    const segments = display.ammoSegments.querySelectorAll('.segment');
    const segmentCount = Math.ceil(ammoPercent / 10);

    segments.forEach((segment, index) => {
      if (index < segmentCount) {
        segment.classList.add('active');
        segment.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
      } else {
        segment.classList.remove('active');
        segment.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
      }
    });

    // Update cooldown bar
    if (cooldownPercent < 100) {
      display.cooldownBar.style.width = `${cooldownPercent}%`;
      display.cooldownBar.style.backgroundColor = '#ff9900';
    } else {
      display.cooldownBar.style.width = '100%';
      display.cooldownBar.style.backgroundColor = '#00aaff';
    }

    // Update next weapon info
    const nextWeapon = weaponSystem.getNextWeapon(mountType);
    if (nextWeapon) {
      const nextName = nextWeapon.config.displayName || nextWeapon.type;
      display.nextWeapon.innerHTML = `NEXT: ${nextName}`;
      display.nextWeapon.style.display = 'block';
    } else {
      display.nextWeapon.style.display = 'none';
    }

    // Show ammo warnings
    if (weapon.ammo === 10 || weapon.ammo === 5 || weapon.ammo === 1) {
      // Removed direct this.addMessage call, needs to be handled in eventHandlers.js
    }

    // Update weapon icon
    display.icon.style.color = weapon.ammo <= 0 ? '#ff0000' : '#00ff00';

    // Show the section
    display.container.style.display = 'block';

    // --- Update Mobile Weapon Widget ---
    if (MobileControlsManager.isTouchDevice) {
        MobileControlsManager.updateWeaponWidget(mountType, {
            name: weapon.config.displayName || weapon.type,
            ammo: weapon.ammo,
            maxAmmo: weapon.maxAmmo,
            cooldownPercent: cooldownPercent
        });
    }
    // ---------------------------------
  } else {
    // No weapon available
    display.name.textContent = 'None';
    display.status.innerHTML = '<span class="status-inactive">NO WEAPON</span>';
    display.ammoCounter.textContent = '0/0';
    display.nextWeapon.style.display = 'none';

    // Reset ammo segments
    const segments = display.ammoSegments.querySelectorAll('.segment');
    segments.forEach(segment => {
      segment.classList.remove('active');
      segment.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });

    // Reset cooldown bar
    display.cooldownBar.style.width = '0%';

    // Update weapon icon
    display.icon.style.color = '#ff0000';

    // --- Update Mobile Weapon Widget (No Weapon) ---
     if (MobileControlsManager.isTouchDevice) {
        MobileControlsManager.updateWeaponWidget(mountType, null); // Pass null for no weapon
    }
    // -------------------------------------------
  }
}
