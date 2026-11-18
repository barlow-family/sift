# Victor App — Build Requirements

## 1. Product goal

Build a flexible, filterable data-management app. The first supported use case is gym exercise and routine tracking, but the underlying model must be reusable for other domains (for example, books or family-tree records) without redesigning the core architecture.

## 2. Core data model

- [ ] Support a reusable collection of records/items rather than hard-coding the app around gym exercises.
- [ ] Allow records to have a name and configurable metadata/attributes.
- [ ] Support user-defined categories and groupings (for example, muscle groups such as upper body and lower body).
- [ ] Support multiple values/labels on an item where useful (for example, an exercise can belong to more than one muscle group).
- [ ] Make the data model independent of the domain so another dataset can be loaded and displayed using the same core capabilities.
- [ ] Keep the model extensible so new categories and attributes can be added without changing the underlying architecture.

## 3. Filtering and views

- [ ] Provide filters that let users show only the records relevant to the current task.
- [ ] Support filtering by categories/attributes (for example, muscle group).
- [ ] Support selecting named routines or exercise collections without assigning them to weekdays or calendar dates.
- [ ] Allow unnecessary records to be hidden from the current view without deleting them.
- [ ] Make it easy to switch between useful subsets of the same dataset.

## 4. Gym domain — initial implementation

### Exercise catalogue

- [ ] Let users create and edit exercises.
- [ ] Let users archive and restore exercises instead of permanently deleting them.
- [ ] Store each exercise as an individual record.
- [ ] Allow exercises to be categorised by muscle group or other user-defined categories.
- [ ] Store the current working weight for each exercise.
- [ ] Store whether the user likes an exercise (or an equivalent simple preference field).
- [ ] Support relevant exercise metadata without requiring every exercise to have the same optional fields.

### Routines

- [ ] Let users create multiple named routines or exercise collections.
- [ ] Let users add existing exercises to a routine.
- [ ] Let users organise the exercises within a routine.
- [ ] Let users choose which routine to view at any time; routines are not assigned to days.
- [ ] Make routine contents filterable by muscle group or other exercise attributes.

### Weight and progress

- [ ] Track weight at the individual exercise level.
- [ ] Let users update an exercise's current weight when they increase or correct it.
- [ ] Treat the latest saved weight as the exercise's current value.
- [ ] Retain dated weight changes in the first release so progress can be reviewed over time.
- [ ] Allow incorrect historical weight entries to be corrected or deleted.
- [ ] Support both kg and lb, with a user-selectable preferred display unit.

## 5. Explicit exclusions for the initial version

- [ ] Do not build set tracking as a core feature.
- [ ] Do not build rep tracking as a core feature.
- [ ] Do not build workout-session logging or require users to record every completed workout.
- [ ] Do not require timers.
- [ ] Do not make historical workout sessions the basis of progress tracking.

The intended workflow is to update the current weight associated with an exercise when the user progresses, rather than logging each set, rep, or workout.

## 6. User experience

- [ ] Keep adding and updating records straightforward.
- [ ] Make filters prominent and easy to change.
- [ ] Make it clear when a record is merely hidden by a filter versus deleted.
- [ ] Provide a clear way to correct or delete accidental data entry.
- [ ] Present a focused view for the selected routine or category, rather than showing all data at once.

## 7. Future extensibility

- [ ] Keep gym-specific fields and screens separate from the reusable data-management layer.
- [ ] Ensure the same core model can support other record types, such as books (author, genre, review) or family-tree entries (age, relationship).
- [ ] Avoid implementing future domains now; preserve the ability to add them later.

## 8. Acceptance criteria

- [ ] A user can create an exercise, assign it to one or more categories, and set its current weight.
- [ ] A user can create multiple named routines, add existing exercises and reorder them.
- [ ] A user can select a routine and filter routines/exercises using available categories and attributes.
- [ ] A user can filter the exercise catalogue or routine by category.
- [ ] A user can update an exercise's weight without creating a workout-session record.
- [ ] A user can correct or delete an incorrect historical weight entry.
- [ ] A user can switch their preferred weight display between kg and lb.
- [ ] A user can archive an exercise while preserving its weight history and existing routine references, and restore it later.
- [ ] Each user signs in to an individual account and can access only their own private data.
- [ ] The app works responsively on desktop, tablet and mobile.
- [ ] The app requires an internet connection; offline access and synchronisation are not required.
- [ ] The app does not require set, rep, timer, or workout-session logging.
- [ ] The underlying data model is not structurally tied to gym data and can represent a different domain through configurable records and attributes.

## 9. Confirmed architecture and product decisions

| Area | Decision |
|---|---|
| Frontend | React + TypeScript + Vite |
| Accounts | Individual Supabase Auth accounts; each user has private data |
| Weight history | Keep dated weight changes and the current value |
| Routines | Named, standalone exercise collections; no weekday or calendar scheduling |
| Routine selection | Users choose collections as needed and filter routines/exercises using available filters |
| Weight units | Support kg and lb with a selectable preferred display unit |
| Exercise removal | Archive rather than permanently delete; preserve history and existing routine links; allow restoration |
| Offline support | Online-only; internet required for loading and saving |
| Device support | Responsive desktop, tablet and mobile layout |

A user can add an exercise to multiple routines and assign multiple categories. Archiving hides an exercise from normal lists and prevents adding it to new routines, while preserving its history and existing routine references.

## 10. Out of scope for the first release

- Weekday or calendar-based routine scheduling.
- Offline caching, offline editing and background synchronisation.
- Set, rep, timer or workout-session logging.

---

## Source and interpretation

Based on the *Victor app discussion* notes dated 18 November 2026 and the subsequent architecture decision process. The decisions in Section 9 were explicitly confirmed. The requirements and acceptance criteria reflect those decisions.
