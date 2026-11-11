// Run with: node src/lib/properCase.test.js
import assert from 'node:assert/strict';

import { properCase } from './properCase.js';

// names
assert.equal(properCase('JUAN DELA CRUZ', 'name'), 'Juan Dela Cruz');
assert.equal(properCase('JUAN DELA CRUZ III', 'name'), 'Juan Dela Cruz III');
assert.equal(properCase('JOSE RIZAL JR.', 'name'), 'Jose Rizal Jr.');
assert.equal(properCase('ANNE-MARIE O\'NEIL', 'name'), 'Anne-Marie O\'Neil');
assert.equal(properCase('MARIA PEÑA', 'name'), 'Maria Peña');
assert.equal(properCase('ÑINO  REYES', 'name'), 'Ñino  Reyes', 'keeps spacing');
assert.equal(properCase('DELA CRUZ, JUAN', 'name'), 'Dela Cruz, Juan');

// courses
assert.equal(properCase('BS INFORMATION TECHNOLOGY', 'course'), 'BS Information Technology');
assert.equal(properCase('BS ACCOUNTANCY MAJOR IN AUDITING', 'course'), 'BS Accountancy major in Auditing');
assert.equal(properCase('BACHELOR OF SCIENCE IN NURSING', 'course'), 'Bachelor of Science in Nursing');
assert.equal(properCase('BS INFORMATION TECHNOLOGY (BSIT)', 'course'), 'BS Information Technology (BSIT)');
assert.equal(properCase('BSED MAJOR IN ENGLISH', 'course'), 'BSED major in English');
assert.equal(properCase('BS HOTEL AND RESTAURANT MANAGEMENT', 'course'), 'BS Hotel and Restaurant Management');
assert.equal(properCase("WOMEN'S STUDIES", 'course'), "Women's Studies");
assert.equal(properCase('IN FOCUS', 'course'), 'In Focus', 'first word is never lowercased');

// already fine text is left as it is
assert.equal(properCase('BS Information Technology', 'course'), 'BS Information Technology');
// a word someone already fixed by hand keeps its capitals
assert.equal(properCase('JUAN McArthur SANTOS', 'name'), 'Juan McArthur Santos');

console.log('properCase: all checks passed');
