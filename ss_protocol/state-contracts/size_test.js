const fs = require('fs');

// Check if the compilation artifact exists
const artifactPath = './out/AuctionSwap.sol/SWAP_V3.json';

if (fs.existsSync(artifactPath)) {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  
  if (artifact.bytecode && artifact.bytecode.object) {
    const bytecode = artifact.bytecode.object;
    const sizeInBytes = bytecode.length / 2; // Each byte is 2 hex chars
    const sizeInKB = sizeInBytes / 1024;
    
    console.log(`Contract bytecode size: ${sizeInBytes} bytes (${sizeInKB.toFixed(2)} KB)`);
    console.log(`Deployment limit: 24576 bytes (24 KB)`);
    console.log(`Status: ${sizeInBytes <= 24576 ? 'PASS' : 'FAIL'} - ${sizeInBytes <= 24576 ? 'Under limit' : 'Still over limit'}`);
    
    if (sizeInBytes > 24576) {
      const excess = sizeInBytes - 24576;
      console.log(`Need to reduce by: ${excess} bytes (${(excess / 1024).toFixed(2)} KB)`);
    }
  } else {
    console.log('Bytecode not found in artifact');
  }
} else {
  console.log('Compilation artifact not found. Please compile first.');
}