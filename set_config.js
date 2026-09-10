const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  return {
    targetDate: '2026-09-25',
    location: 'Globsyn Crystals (HQ) - Kolkata',
    space: 'Regular Seating',
    room: '115',
    autoFallbackIfRoomFull: true
  };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const config = loadConfig();

console.log('\n==================================================');
console.log('⚙️  Office Seat Booking - Configuration Helper');
console.log('==================================================');
console.log(`Current Settings:`);
console.log(`  📅 Date:     "${config.targetDate}"`);
console.log(`  🏢 Location: "${config.location}"`);
console.log(`  💺 Space:    "${config.space}"`);
console.log(`  🚪 Room:     "${config.room}"`);
console.log('--------------------------------------------------');

rl.question(`👉 Enter Target Date (Leave blank to keep "${config.targetDate}"): `, (ansDate) => {
  if (ansDate.trim()) {
    config.targetDate = ansDate.trim();
  }

  rl.question(`👉 Enter Room Number (Leave blank to keep "${config.room}"): `, (ansRoom) => {
    if (ansRoom.trim()) {
      config.room = ansRoom.trim();
    }

    saveConfig(config);
    console.log('\n✅ Configuration updated successfully in config.json:');
    console.log(JSON.stringify(config, null, 2));
    console.log('\n');
    rl.close();
  });
});
