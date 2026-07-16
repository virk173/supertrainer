import type { StyleDomain } from "../../src/style/schemas";

// Realistic fake trainer materials + the profile we expect extraction to
// recover. Arrays hold the KEY items (lowercase substrings) the scorer checks
// by recall, so "roti" matches "rotis"; free-text fields are scored by token
// overlap; enums/numbers by exact match. Empty arrays assert nothing required.

export interface StyleFixture {
  name: string;
  domain: StyleDomain;
  text: string;
  expected: Record<string, unknown>;
}

export const FIXTURES: StyleFixture[] = [
  {
    name: "diet-indian-standard",
    domain: "diet",
    text: `CLIENT MEAL PLAN — Rahul (Muscle Gain Phase)
Coach: FitWithArjun

5 meals a day. Weigh every portion in grams — no eyeballing.

Meal 1 (7am): 4 whole eggs + 3 egg whites, 2 rotis, black coffee
Meal 2 (10am, post-workout): 1 scoop whey isolate + 1 banana
Meal 3 (1pm): 200g chicken breast, 1.5 cup basmati rice, dal, mixed sabzi
Meal 4 (5pm): 150g paneer, 2 rotis, curd
Meal 5 (9pm): 200g fish, salad, 1 tsp ghee

Carbs are concentrated around training (post-workout shake + lunch).
No fried food, no sugar, no packaged snacks — non-negotiable.
He loves paneer and dal so we keep those in every week.
Supplements: whey post-workout, creatine 5g daily, omega-3 with dinner.`,
    expected: {
      mealsPerDay: 5,
      mealStructure: "5 meals a day",
      carbTiming: "post_workout",
      portionStyle: "weighed_grams",
      protocols: [],
      cuisineBias: ["indian"],
      foodRotationPool: ["egg", "roti", "chicken", "rice", "dal", "paneer", "fish"],
      lovedFoods: ["paneer", "dal"],
      bannedFoods: ["fried", "sugar"],
      supplementPlacement: ["whey", "creatine", "omega"],
    },
  },
  {
    name: "diet-if-16-8",
    domain: "diet",
    text: `NUTRITION PROTOCOL — Sarah (Fat Loss)

16:8 intermittent fasting. Eating window 12pm–8pm; training is done fasted in the morning.
During the fast: water, black coffee, green tea only.
3 meals inside the window, no snacking between.
Portions by hand: palm of protein, fist of veg, cupped hand of carbs, thumb of fats.
Carbs kept low through the day with the largest serving at dinner (backloaded).
Mediterranean lean — olive oil, fish, chicken, plenty of greens.
Avoids alcohol and refined sugar.
Supplements: electrolytes during the fast, whey to break the fast.`,
    expected: {
      mealsPerDay: 3,
      mealStructure: "16:8 window with 3 meals",
      carbTiming: "backloaded",
      portionStyle: "hand_portions",
      protocols: ["intermittent_fasting"],
      cuisineBias: ["mediterranean"],
      foodRotationPool: ["olive oil", "fish", "chicken", "greens"],
      lovedFoods: [],
      bannedFoods: ["alcohol", "sugar"],
      supplementPlacement: ["electrolytes", "whey"],
    },
  },
  {
    name: "diet-carb-cycle",
    domain: "diet",
    text: `CARB CYCLING PLAN — Mike (Recomp)

5 meals per day. Carbs cycle across the week:
- Training days (Mon/Wed/Fri): HIGH carb, 300g.
- Rest days (Tue/Thu/Sat/Sun): LOW carb, 100g.
Carbs are placed around training — rice and oats pre and post workout.
Protein stays at 220g every single day. All food weighed in grams.
Staples: oats, rice, chicken, lean beef, sweet potato.
He hates broccoli — always swap it for green beans.
Supplements: creatine daily, whey x2, multivitamin in the morning.`,
    expected: {
      mealsPerDay: 5,
      mealStructure: "5 meals per day",
      carbTiming: "post_workout",
      portionStyle: "weighed_grams",
      protocols: ["carb_cycling"],
      cuisineBias: [],
      foodRotationPool: ["oats", "rice", "chicken", "beef", "sweet potato"],
      lovedFoods: [],
      bannedFoods: ["broccoli"],
      supplementPlacement: ["creatine", "whey", "multivitamin"],
    },
  },
  {
    name: "training-upper-lower",
    domain: "training",
    text: `TRAINING SPLIT — 4 Day Upper/Lower (Intermediate)

Mon — Upper A: Barbell Bench Press 4x6-8, Barbell Row 4x8, Overhead Press 3x8-10, Pull-ups 3xAMRAP, Barbell Curl 3x12
Tue — Lower A: Back Squat 4x6-8, Romanian Deadlift 3x8, Leg Press 3x12, Calf Raise 4x15
Thu — Upper B: Incline DB Press 4x8-10, Lat Pulldown 4x10, Lateral Raise 3x15, Dips 3x10
Fri — Lower B: Deadlift 4x5, Front Squat 3x8, Leg Curl 3x12, Calf Raise 4x15

Progression: add weight once you hit the top of the rep range (double progression on load).
Warmup: 5 minutes on the bike, then 2 ramp-up sets on the first compound.
Rep ranges are mostly 6-12 — compounds heavier (5-8), isolation higher (12-15).`,
    expected: {
      daysPerWeek: 4,
      splitArchetypes: ["upper/lower"],
      exercisePool: [
        "bench press",
        "row",
        "overhead press",
        "squat",
        "romanian deadlift",
        "deadlift",
        "pulldown",
      ],
      progressionStyle: "load",
      volumeRepHabits: "3-4 sets of 6-12 reps",
      warmupPatterns: "bike then ramp-up sets on the first compound",
    },
  },
  {
    name: "voice-checkin",
    domain: "voice",
    text: `[Trainer's messages pulled from weekly check-ins]

"Yo Priya! 🙌 How'd the week go? Drop me your weight + a couple pics whenever."
"Amazing work this week, seriously proud of you 💪 Down 0.4kg and steps are up — keep that momentum!"
"No stress about the weekend slip, happens to everyone. We adjust and move on 🙂"
"Quick one — how's the sleep been? 😴 That's the missing piece imo."
"Beast mode. 🔥 Same targets this week, just add a 10 min walk after dinner. You've got this! 💯"
"Haan I know Mondays are tough yaar, but you still showed up. That's what counts. 🙌"`,
    expected: {
      toneMarkers: ["encouraging", "supportive"],
      greeting: "Yo Priya! How'd the week go",
      signoff: "You've got this",
      emojiRate: "high",
      languageMix: "hinglish",
      avgMessageLength: "short",
      phraseBank: [
        "beast mode",
        "you've got this",
        "keep that momentum",
        "that's what counts",
      ],
    },
  },
];
