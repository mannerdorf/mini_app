import { it, expect } from "vitest";
import { cacheFreshness } from "./CacheFreshness";
it("reports the oldest document and unknown metadata, not the latest refreshed chunk", () => {
  const result = cacheFreshness([{_cacheUpdatedAt:"2026-09-01T00:00:00Z"},{_cacheUpdatedAt:"2026-09-28T00:00:00Z"},{}],Date.parse("2026-09-28T01:00:00Z"));
  expect(result).toEqual({oldest:Date.parse("2026-09-01T00:00:00Z"),unknown:1,stale:true});
});
it("does not call missing/invalid timestamps fresh", () => {
  expect(cacheFreshness([{}, {_cacheUpdatedAt:"bad"}])).toEqual({oldest:null,unknown:2,stale:false});
});
