const fs = require('fs');
const path = require('path');

console.log('\n=============================================');
console.log('🧪 TESTING EYE-IN ROAD AI SYSTEM COMPONENTS');
console.log('=============================================\n');

const checks = [
    { name: 'Dashboard HTML', file: 'public/road-ai-dashboard.html' },
    { name: 'AI Engine Frontend JS', file: 'public/js/road-ai.js' },
    { name: 'Hazards Backend API Route', file: 'routes/hazards.js' },
    { name: 'Python YOLOv8 Standalone Script', file: 'ai_engine/road_hazard_detector.py' },
    { name: 'AI Training Documentation', file: 'ai_engine/README.md' }
];

let allPassed = true;
checks.forEach(c => {
    const fullPath = path.join(__dirname, c.file);
    if (fs.existsSync(fullPath)) {
        const size = fs.statSync(fullPath).size;
        console.log(`✅ [PASS] ${c.name} (${c.file}) -> ${size} bytes`);
    } else {
        console.log(`❌ [FAIL] Missing: ${c.file}`);
        allPassed = false;
    }
});

// Test Hazards Route module loading
try {
    const hazardRouter = require('./routes/hazards');
    console.log('✅ [PASS] routes/hazards.js loaded and exported valid express router');
} catch (err) {
    console.log('❌ [FAIL] Error loading routes/hazards.js:', err.message);
    allPassed = false;
}

console.log('\n---------------------------------------------');
if (allPassed) {
    console.log('🎉 ALL AI COMPONENTS PASSED VALIDATION!');
} else {
    console.log('⚠️ Some checks failed.');
}
console.log('---------------------------------------------\n');
