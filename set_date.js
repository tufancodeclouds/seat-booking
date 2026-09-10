const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  return {
    targetDate: 'TODAY',
    location: 'Globsyn Crystals (HQ) - Kolkata',
    space: 'Regular Seating',
    room: '115'
  };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

const args = process.argv.slice(2);
const config = loadConfig();

if (args.length > 0) {
  const dateInput = args.join(' ').trim();
  config.targetDate = dateInput;
  saveConfig(config);
  console.log(`\n✅ Target booking date updated to: "${dateInput}" in config.json\n`);
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n=============================================');
console.log('📅 Set Target Date for 12:01 AM Seat Booking');
console.log('=============================================');
console.log(`Current setting: "${config.targetDate}"`);
console.log('Options you can enter:');
console.log('  1. "TODAY"     -> Books today\'s date (e.g. 09 Sep)');
console.log('  2. "TOMORROW"  -> Books next day\'s date (e.g. 10 Sep)');
console.log('  3. Any date    -> e.g. "2026-09-24" or "24 Sep 2026"');
console.log('---------------------------------------------');

rl.question('👉 Enter desired date: ', (answer) => {
  const choice = answer.trim();
  if (choice) {
    config.targetDate = choice;
    saveConfig(config);
    console.log(`\n✅ Target booking date successfully updated to: "${choice}" in config.json\n`);
  } else {
    console.log(`\nℹ️ No changes made. Kept current date: "${config.targetDate}"\n`);
  }
  rl.close();
});
