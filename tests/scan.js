// Run: node tests/scan.js
// The screenshot parser against text as recognition typically returns it for the common
// workout screens. Exit code 1 on any failure.
const s = require('../scan.js');
let failures = 0;
function check(name, ok, detail){ if(ok) console.log('  ok   '+name); else { failures++; console.log('  FAIL '+name+(detail?' — '+detail:'')); } }
const today = new Date(2026, 9, 7); // 7 Oct 2026

console.log('1. Apple Fitness summary (miles)');
{
  const r = s.parseWorkoutText(`Outdoor Run
Today at 7:02 AM
Workout Time
32:15
Distance
3.52MI
Active Kilocalories
312CAL
Total Kilocalories
358CAL
Avg. Pace
9'10"/MI
Avg. Heart Rate
152BPM`, {today});
  check('date is today', r.date==='2026-10-07', r.date);
  check('distance 3.52 mi', Math.abs(r.distanceKm-3.52*1.609344)<0.01, String(r.distanceKm));
  check('time 32:15', r.durationSec===32*60+15, String(r.durationSec));
  check('pace read', Math.abs(r.paceSecPerKm - 550/1.609344)<1, String(r.paceSecPerKm));
  check('confidence high', r.confidence==='high', r.confidence);
  check('kind outdoor run', r.kind==='outdoor run');
}

console.log('2. Apple Fitness summary (km, dated, with recognition slips)');
{
  const r = s.parseWorkoutText(`Outdoor Run
Oct 3, 2026 at 6:40 PM
Workout Time
1:02:30
Distance
10,02KN
Avg. Pace
6’14”/KM`, {today});
  check('date parsed', r.date==='2026-10-03', r.date);
  check('comma decimal and KN fixed', Math.abs(r.distanceKm-10.02)<0.01, String(r.distanceKm));
  check('hour-long time', r.durationSec===3750, String(r.durationSec));
  check('pace per km', Math.abs(r.paceSecPerKm-374)<1, String(r.paceSecPerKm));
}

console.log('3. Strava summary');
{
  const r = s.parseWorkoutText(`Morning Run
Tuesday, October 6, 2026
Distance 5.00 mi
Moving Time 45:30
Elapsed Time 48:02
Pace 9:06 /mi`, {today});
  check('date', r.date==='2026-10-06', r.date);
  check('moving time preferred over elapsed', r.durationSec===45*60+30, String(r.durationSec));
  check('distance', Math.abs(r.distanceKm-5*1.609344)<0.01);
}

console.log('4. Apple splits screen');
{
  const r = s.parseWorkoutText(`Splits
MI  PACE      HR
1   9'05"/MI  148
2   9'12"/MI  151
3   8'58"/MI  156
4   9'20"/MI  154
Heart Rate`, {today});
  check('four splits', r.splits.length===4, String(r.splits.length));
  check('split pace in s/km', Math.abs(r.splits[2].paceSecPerKm - 538/1.609344)<1, String(r.splits[2] && r.splits[2].paceSecPerKm));
}

console.log('4b. Apple Fitness summary as it really reads (two columns, in-page splits)');
{
  const r = s.parseWorkoutText(`1:03 LTE 64
Sun, Oct 4
Workout Details >
Workout Time Distance
0:18:55 2.19MI
Active Calories Total Calories
237CAL 268CAL
Avg. Cadence Avg. Pace
158SPM 8'38"/MI
Avg. Heart Rate
139BPM
Effort +
Skipped
Splits >
Time Pace Heart Rate
1 08:24 8'24'' 133BPM
2 08:48 8'48'' 144BPM
3 01:43 8'54'' 143BPM
Summary Fitness+ Workout Sharing`, {today});
  check('date Oct 4', r.date==='2026-10-04', r.date);
  check('distance 2.19 mi', Math.abs(r.distanceKm-2.19*1.609344)<0.01, String(r.distanceKm));
  check('time 18:55 (not the 1:03 clock, not a split)', r.durationSec===18*60+55, String(r.durationSec));
  check('average pace 8:38/mi', Math.abs(r.paceSecPerKm-518/1.609344)<1, String(r.paceSecPerKm));
  check('three splits', r.splits.length===3, String(r.splits.length));
  check('split paces, not split times', r.splits.length===3 && Math.abs(r.splits[2].paceSecPerKm-534/1.609344)<1, String(r.splits[2] && r.splits[2].paceSecPerKm));
  check('confidence high', r.confidence==='high', r.confidence);
}

console.log('4c. Apple Fitness outdoor summary: Workout Time beside Elapsed Time');
{
  const r = s.parseWorkoutText(`1:05 5G 64
Thu, Oct 1
Workout Details >
Workout Time Elapsed Time
0:24:57 0:26:51
Distance Active Calories
2.84MI 310CAL
Total Calories Elevation Gain
351CAL 104FT
Avg. Power Avg. Cadence
239W 156SPM
Avg. Pace Avg. Heart Rate
8'47"/MI 156BPM
Effort +
Skipped
Splits >
Time Pace Heart Rate
1 09:15 9'15'' 147BPM`, {today});
  check('date Oct 1', r.date==='2026-10-01', r.date);
  check('workout time, not elapsed', r.durationSec===24*60+57, String(r.durationSec));
  check('distance 2.84 mi', Math.abs(r.distanceKm-2.84*1.609344)<0.01, String(r.distanceKm));
  check('pace 8:47/mi', Math.abs(r.paceSecPerKm-527/1.609344)<1, String(r.paceSecPerKm));
  check('one split read', r.splits.length===1 && Math.abs(r.splits[0].paceSecPerKm-555/1.609344)<1, JSON.stringify(r.splits));
}

console.log('4d. Apple Splits screen on its own');
{
  const r = s.parseWorkoutText(`1:08 5G 63
Splits
1 Mile
Time Pace
1 09:15 9'15''/MI
2 08:51 8'51''/MI
3 06:51 8'08''/MI`, {today});
  check('three splits with times', r.splits.length===3 && r.splits.every(x=>x.timeSec>0), JSON.stringify(r.splits));
  check('split paces per km', Math.abs(r.splits[2].paceSecPerKm-488/1.609344)<1, String(r.splits[2] && r.splits[2].paceSecPerKm));
  check('time summed from splits (24:57)', r.durationSec===24*60+57, String(r.durationSec));
  check('distance derived (about 2.84 mi)', Math.abs(r.distanceKm/1.609344-2.84)<0.03, String(r.distanceKm/1.609344));
  check('no date, says so', r.date===null && r.notes.some(n=>/No date/.test(n)));
}

console.log('4e. Apple Splits table with heart rate and cadence, in every reading order (defect 165)');
{
  // The owner's screenshot: three splits, 09:24 / 09:22 / 04:44 at 9'24''-9'22''/MI. The text
  // reader may return the table row by row, without row numbers, or column by column; the
  // "Time" and "Pace" headings label each split, never the run.
  const head = `Splits\n1 Mile\nTime Pace Heart Rate Cadence`;
  const layouts = {
    'row by row': `3:58 44\n${head}\n1 09:24 9'24''/MI 132BPM 158SPM\n2 09:22 9'22''/MI 148BPM 157SPM\n3 04:44 9'22''/MI 152BPM 156SPM`,
    'no row numbers': `${head}\n09:24 9'24''/MI 132BPM 158SPM\n09:22 9'22''/MI 148BPM 157SPM\n04:44 9'22''/MI 152BPM 156SPM`,
    'column by column, cell per line': `3:58 44\nSplits\n1 Mile\nTime\nPace\nHeart Rate\nCadence\n1\n09:24\n9'24''/MI\n132BPM\n158SPM\n2\n09:22\n9'22''/MI\n148BPM\n157SPM\n3\n04:44\n9'22''/MI\n152BPM\n156SPM`,
    'column by column, in blocks': `${head}\n1\n2\n3\n09:24\n09:22\n04:44\n9'24''/MI\n9'22''/MI\n9'22''/MI\n132BPM 158SPM\n148BPM 157SPM\n152BPM 156SPM`,
  };
  for(const [name, txt] of Object.entries(layouts)){
    const r = s.parseWorkoutText(txt, {today});
    check(`${name}: time is the splits' sum, 23:30, not the first split`, r.durationSec===23*60+30, String(r.durationSec));
    check(`${name}: distance worked out, 2.5 mi`, r.distanceKm && Math.abs(r.distanceKm/1.609344-2.5)<0.02, String(r.distanceKm && r.distanceKm/1.609344));
    check(`${name}: no split's pace taken as the average`, r.paceSecPerKm==null, String(r.paceSecPerKm));
    check(`${name}: each split has its own time`, r.splits.map(x=>x.timeSec).join(',')==='564,562,284', JSON.stringify(r.splits.map(x=>x.timeSec)));
  }
}

console.log('4f. the phone clock is never part of the run (defect 167)');
{
  const rows = `1 Mile
Time Pace
1 09:57 9'567'"/mi
2 09:10 9'10"/mi
3 09:16 9'16"/mI
4 09:04 9'04'/mi
5 08:53 8'63"/mi
6 08:25 8'25"/mi
7 02:36 8'07"/mi`;
  const cases = {
    'as the app read it': `4:26 \\ all 56% C2 |\nSplits ) 4\n${rows}`,
    'clock read just below the header': `Splits\n4:23 all 5G 47\n${rows}`,
    'clock alone below the header': `Splits\n4:23\n${rows}`,
    'clock read as 4.23': `4.23 all 5G 47\nSplits\n${rows}`,
  };
  for(const [k, t] of Object.entries(cases)){
    const r = s.parseWorkoutText(t, {today});
    check(`${k}: 57:21 over 6.32 mi`, r.durationSec===57*60+21 && Math.abs(r.distanceKm/1.609344-6.32)<0.01, `${r.durationSec} ${r.distanceKm}`);
  }
  const r = s.parseWorkoutText(`4:26 all 56%\nSplits\n${rows}`, {today});
  check("misread pace 8'63\" settled by the split's own time, 8:53", Math.round(r.splits[4].paceSecPerKm*1.609344)===533, String(r.splits[4].paceSecPerKm*1.609344));
  // a split time the reader missed: the clock must not stand in for it, nor for the total
  const miss = s.parseWorkoutText(`Splits\n4:23 ull 5G\n1 Mile\nTime Pace\n1 9'57"/mi\n2 09:10 9'10"/mi\n3 09:16 9'16"/mi\n4 09:04 9'04"/mi\n5 08:53 8'53"/mi\n6 08:25 8'25"/mi\n7 02:36 8'07"/mi`, {today});
  check('one split time missed: no total taken from the clock', miss.durationSec!==263 && !miss.splits.some(x=>x.timeSec===263), `${miss.durationSec}`);
  const cols = s.parseWorkoutText(`4:23\nSplits\n1 Mile\nTime\n09:10\n09:16\n09:04\n08:53\n08:25\n02:36\nPace\n9'57"/mi\n9'10"/mi\n9'16"/mi\n9'04"/mi\n8'53"/mi\n8'25"/mi\n8'07"/mi`, {today});
  check('columns with a time missed: the clock is not the total', cols.durationSec!==263, `${cols.durationSec}`);
}

console.log('5. Apple segments and rep time');
{
  const r = s.parseWorkoutText(`Segments
1  0.50 MI  3:48
2  0.25 MI  2:30
3  0.50 MI  3:52
4  0.25 MI  2:35
5  0.50 MI  3:50
Heart Rate`, {today});
  check('five segments', r.segments.length===5, String(r.segments.length));
  const rep = s.repSecFromSegments(r.segments, 800);
  check('800 m reps averaged from the 0.5 mi segments', rep!=null && Math.abs(rep-229)<=2, String(rep));
  check('no match for 400 m reps', s.repSecFromSegments(r.segments, 400)!=null); // 0.25 mi ~ 402 m
}

console.log('6. Garmin summary and the am/pm trap');
{
  const r = s.parseWorkoutText(`Running
October 5, 2026 6:45 AM
Distance 6.21 mi
Time 55:10
Avg Pace 8:53 /mi
Elevation Gain 120 ft`, {today});
  check('date', r.date==='2026-10-05', r.date);
  check('time of day ignored, duration kept', r.durationSec===55*60+10, String(r.durationSec));
}

console.log('7. missing time is derived from pace');
{
  const r = s.parseWorkoutText(`Distance
4.00 MI
Avg. Pace
10'00"/MI`, {today});
  check('derived 40:00', r.durationSec===2400, String(r.durationSec));
  check('note says so', r.notes.some(n=>/worked out/.test(n)));
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall scan checks passed');
process.exit(failures ? 1 : 0);
