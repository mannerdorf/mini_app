00:06:55.778 Running build in Portland, USA (West) – pdx1
00:06:55.779 Build machine configuration: 4 cores, 8 GB
00:06:55.859 Cloning github.com/mannerdorf/mini_app (Branch: main, Commit: 0e17192)
00:06:56.293 Cloning completed: 434.000ms
00:06:56.377 Restored build cache from previous deployment (2yMXqgEd5PyKantJVMqnfzHXbq8v)
00:06:56.823 Running "vercel build"
00:06:57.193 Vercel CLI 48.10.3
00:06:58.145 Installing dependencies...
00:06:58.998 
00:06:58.998 up to date in 592ms
00:06:58.998 
00:06:58.998 28 packages are looking for funding
00:06:58.998   run `npm fund` for details
00:06:59.124 
00:06:59.124 > miniapp@1.0.0 build
00:06:59.124 > vite build
00:06:59.124 
00:06:59.437 [36mvite v5.4.21 [32mbuilding for production...[36m[39m
00:06:59.491 transforming...
00:06:59.554 [32m✓[39m 4 modules transformed.
00:06:59.555 [31mx[39m Build failed in 90ms
00:06:59.556 [31merror during build:
00:06:59.556 [31m[vite:esbuild] Transform failed with 1 error:
00:06:59.556 /vercel/path0/src/App.tsx:521:0: ERROR: Unexpected end of file[31m
00:06:59.556 file: [36m/vercel/path0/src/App.tsx:521:0[31m
00:06:59.556 [33m
00:06:59.556 [33mUnexpected end of file[33m
00:06:59.556 519|                      </button>
00:06:59.556 520|                      <button className="theme-toggle-button" onClick={toggleTheme} title="
00:06:59.556 521|  
00:06:59.556    |  ^
00:06:59.556 [31m
00:06:59.556     at failureErrorWithLog (/vercel/path0/node_modules/esbuild/lib/main.js:1472:15)
00:06:59.556     at /vercel/path0/node_modules/esbuild/lib/main.js:755:50
00:06:59.557     at responseCallbacks.<computed> (/vercel/path0/node_modules/esbuild/lib/main.js:622:9)
00:06:59.557     at handleIncomingPacket (/vercel/path0/node_modules/esbuild/lib/main.js:677:12)
00:06:59.557     at Socket.readFromStdout (/vercel/path0/node_modules/esbuild/lib/main.js:600:7)
00:06:59.557     at Socket.emit (node:events:519:28)
00:06:59.557     at addChunk (node:internal/streams/readable:561:12)
00:06:59.557     at readableAddChunkPushByteMode (node:internal/streams/readable:512:3)
00:06:59.557     at Readable.push (node:internal/streams/readable:392:5)
00:06:59.557     at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)[39m
00:06:59.569 Error: Command "npm run build" exited with 1
