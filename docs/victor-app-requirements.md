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
- [ ] Support filtering or viewing a specific day's routine.
- [ ] Allow unnecessary records to be hidden from the current view without deleting them.
- [ ] Make it easy to switch between useful subsets of the same dataset.

## 4. Gym domain — initial implementation

### Exercise catalogue

- [ ] Let users create, edit, and delete exercises.
- [ ] Store each exercise as an individual record.
- [ ] Allow exercises to be categorised by muscle group or other user-defined categories.
- [ ] Store the current working weight for each exercise.
- [ ] Store whether the user likes an exercise (or an equivalent simple preference field).
- [ ] Support relevant exercise metadata without requiring every exercise to have the same optional fields.

### Routines

- [ ] Let users create daily routines/lists (for example, a Tuesday workout).
- [ ] Let users add existing exercises to a routine.
- [ ] Let users organise the exercises within a routine.
- [ ] Allow a routine view to show only the exercises assigned to that day.
- [ ] Make routine contents filterable by muscle group or other exercise attributes.

### Weight and progress

- [ ] Track weight at the individual exercise level.
- [ ] Let users update an exercise's current weight when they increase or correct it.
- [ ] Treat the latest saved weight as the exercise's current value.
- [ ] Optionally retain dated weight changes so a trend line or graph can be generated later.
- [ ] If dated changes are retained, allow an incorrect entry to be deleted or corrected so it does not distort progress reporting.

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
- [ ] Present a focused view for the selected day or category, rather than showing all data at once.

## 7. Future extensibility

- [ ] Keep gym-specific fields and screens separate from the reusable data-management layer.
- [ ] Ensure the same core model can support other record types, such as books (author, genre, review) or family-tree entries (age, relationship).
- [ ] Avoid implementing future domains now; preserve the ability to add them later.

## 8. Acceptance criteria

- [ ] A user can create an exercise, assign it to one or more categories, and set its current weight.
- [ ] A user can create a day-specific routine and add exercises to it.
- [ ] A user can filter the exercise catalogue or routine by category.
- [ ] A user can update an exercise's weight without creating a workout-session record.
- [ ] A user can correct or delete an incorrect weight entry.
- [ ] The app does not require set, rep, timer, or workout-session logging.
- [ ] The underlying data model is not structurally tied to gym data and can represent a different domain through configurable records and attributes.

## 9. Open questions to resolve before implementation

- [ ] Should dated weight changes be retained in the first release, or should the app store only the latest value initially?
- [ ] Can an exercise belong to multiple routines and multiple muscle groups? (Recommended: yes.)
- [ ] Should routines be reusable templates, calendar-day assignments, or both?
- [ ] What units should weight support (kg only initially, or user-selectable units)?
- [ ] Should deleting an exercise also remove it from routines, or should the app ask for confirmation?
- [ ] Are user accounts, cross-device sync, and offline support required for the first release?
- [ ] What is the expected initial device layout (desktop, mobile, or responsive)?

---

## Source and interpretation

Based on the *Victor app discussion* notes dated 18 November 2026. The gym-first priority, reusable/filterable data model, and exclusion of set/rep tracking are recorded decisions. The acceptance criteria and UX details above translate those decisions into testable build requirements. Items in **Open questions** were not settled in the notes and should be confirmed before implementation.
