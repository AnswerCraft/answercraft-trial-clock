import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isJob} from '../src/auth.mjs';
test('a cutoff job carries only its opaque id, kind and timestamp',()=>{assert.ok(isJob({id:'7'.repeat(64),kind:'cutoff',runAt:1794758400000}));});
