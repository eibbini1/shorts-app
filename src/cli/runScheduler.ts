if (!process.argv.includes('--watch')) process.argv.push('--watch');
await import('./automate.js');
export {};
