const {TokenIgnoreFilter}=require(process.argv[2]);
const matcher=new TokenIgnoreFilter().globToRegex('a*a*a*a*a*a*a*a*a*b');
const start=performance.now();
console.log(JSON.stringify({matched:matcher.test('a'.repeat(100)+'.ts'),durationMs:performance.now()-start}));
