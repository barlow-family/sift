Nov 18, 2026

## **Victor app discussion**

Attachments [Victor app discussion](https://calendar.google.com/calendar/event?eid=MzhsbmVldmlxOTE1N2xkZWl2dHZkNGNyaXIgbWVAY2hyaXNiYXJsb3cubno)

Meeting records [Transcript](https://docs.google.com/document/d/16Y9guJ8l9tbSMVDbFqGbyenoZrXdySADClpV39829dI/edit?usp=drive_web&tab=t.9k4kv6844ki9) 

### **Summary**

Data model discussion covering reusable architecture and gym tracking priorities.

**Reusable Data Model Architecture**  
Core data model supports multiple domains like fitness and family trees.

**Gym App Exercise Management**  
Application prioritizes gym tracking with customizable muscle groups and weights.

**Progress Tracking And Updates**  
Progress tracking updates current weight values rather than storing full history.

### **Decisions**

## Aligned

* **Reusable data model with filtering capabilities** The application will utilize a reusable data model capable of supporting multiple use cases and custom filters.

* **Gym domain as initial priority** The gym domain is established as the primary focus and first priority for the application.

* **Exclusion of set and rep tracking** Explicit set and rep tracking will be excluded from the initial core feature set.

* **Exercise-level weight tracking configuration** The system will track weight updates at the individual exercise level rather than logging complete workout sessions.

### **Details**

**App Purpose and Reusable Data Model**: Chris Barlow explains that the core app is built on a reusable data model designed to handle multiple use cases beyond fitness, such as filtering elements in a family tree by age or relation percentage ([00:00:00](?tab=t.9k4kv6844ki9#heading=h.mu5j4wrr81hj)). Chris Barlow notes that this underlying data model allows users to point the tool at different datasets and view categorized information in flexible ways ([00:00:55](?tab=t.9k4kv6844ki9#heading=h.o3it05lfdx37)).

---

**Gym App Exercise Management and Routine Creation**: Chris Barlow discusses using the app for gym exercises like hip thrusts, shoulder presses with dumbbells, and cable lats, which can be categorized by muscle groups such as upper or lower body ([00:02:10](?tab=t.9k4kv6844ki9#heading=h.5ucxcfjpwxkj)). Users can package these exercises into a daily list for specific days, like Tuesday, and include additional metadata such as whether they liked the exercise and the weight used ([00:03:19](?tab=t.9k4kv6844ki9#heading=h.bix7jopmols5)).

---

**Cross-Domain Applicability and Priority**: Chris Barlow outlines that while gym tracking is the first priority domain for the tool, the architecture will support other projects in the future, such as tracking books by author, genre, and reviews, or organizing family tree data. Categories can be freely added to suit different applications while maintaining the baseline data model ([00:04:29](?tab=t.9k4kv6844ki9#heading=h.nkhvwp4z6101)) ([00:05:36](?tab=t.9k4kv6844ki9#heading=h.sn7xu2mtwygg)).

---

**Comparison with Google Keep and Filtering Functionality**: Chris Barlow differentiates the tool from Google Keep by emphasizing its filtering capabilities, which allow users to hide unnecessary data and view only what is needed at a given moment, such as a specific day's workout or specific muscle groups ([00:05:58](?tab=t.9k4kv6844ki9#heading=h.3glqntmukcui)).

---

**Workout Structure, Repetitions, and Weight Management**: Chris Barlow states that timers, sets, and reps are not required core features because default parameters already target 8 to 12 repetitions and 3 to 4 sets. Instead, the app focuses on specifying weight values per exercise, which Chris Barlow adjusts whenever repetitions exceed the target range of 8 to 12 ([00:06:58](?tab=t.9k4kv6844ki9#heading=h.mc8sjssyl183)) ([00:07:41](?tab=t.9k4kv6844ki9#heading=h.zicpyezbkbgq)).

---

**Progress Tracking via State Updates**: Chris Barlow clarifies that the app does not record historical workout session data, but rather tracks progress by updating the current weight value associated with an exercise, such as changing hip thrust weight from 60 kilos to 70 kilos or curls from 20 kilos to 25 kilos ([00:08:05](?tab=t.9k4kv6844ki9#heading=h.xtam7w6bm55y)). Chris Barlow mentions that updating these values on specific dates could potentially generate a trend line or graph to reflect changes over time ([00:10:10](?tab=t.9k4kv6844ki9#heading=h.558nucdqnyck)).

---

**Error Correction and Data Deletion**: Chris Barlow addresses how to handle typos or incorrect entries, such as accidentally inputting 1,000 kilos, explaining that users can simply delete the incorrect value to prevent data distortions ([00:10:54](?tab=t.9k4kv6844ki9#heading=h.gfva6q1el6x)).

*You should review Gemini's notes to make sure they're accurate. [Get tips and learn how Gemini takes notes](https://support.google.com/meet/answer/14754931)*

*How is the quality of **these specific notes?** [Take a short survey](https://google.qualtrics.com/jfe/form/SV_5bXzKQfylMIhSXc?confid=vj2y1r726jbuHKRJh0uEDxIQOAIIigIgABgECA&detailLevel=standard&hasImages=False&entryPoint=footerMain&isGoogler=False&lang=en-US) to let us know your feedback, including how helpful the notes were for your needs.*