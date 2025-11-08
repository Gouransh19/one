# Delete Feature Design: First Principles Analysis

## Part 1: First Principles Requirements Decomposition

### Core Problem Statement
**Atomic Truth**: Users need to remove prompts/contexts from their library to maintain a clean, curated collection without disrupting their workflow.

### Fundamental Requirements (Decomposed from First Principles)

#### R1: Visual Discovery (Hover State)
- **Requirement**: User must discover delete capability without UI clutter
- **Constraint**: Only visible on hover (minimal cognitive load)
- **Position**: Right side of each item rectangle (as specified)
- **Visual**: Minus symbol (-) that appears smoothly on hover
- **Aesthetic**: Dark theme, subtle but discoverable

#### R2: Delete Action Trigger
- **Requirement**: Single click on minus symbol initiates deletion flow
- **Constraint**: Must not interfere with existing click-to-select behavior
- **Prevention**: Click event must be isolated to minus button only

#### R3: Confirmation Safety
- **Requirement**: Prevent accidental deletion (irreversible action)
- **Constraint**: Must not break user flow (quick cancel option)
- **Dialog**: "Are you sure you want to delete this [prompt/context]?"
- **Options**: Yes (confirm) | No (cancel)
- **Behavior**: No → return to selector, Yes → proceed to deletion

#### R4: Storage Deletion
- **Requirement**: Remove item from persistent storage
- **Method**: Use existing `deletePromptAtomic` / `deleteContextAtomic`
- **Constraint**: Must be atomic (concurrency-safe)
- **Verification**: Confirm deletion succeeded before UI update

#### R5: UI State Synchronization
- **Requirement**: UI must reflect deletion immediately
- **Constraint**: Must not break existing selector behavior
- **Method**: Refresh selector list after successful deletion
- **Fallback**: If deletion fails, show error, keep item visible

#### R6: Architecture Integrity
- **Requirement**: Maintain SICP principles (separation of concerns)
- **UI Layer**: All DOM manipulation in UIService
- **Storage Layer**: All persistence through StorageService interface
- **Message Layer**: Communication via background script message passing
- **No Direct Coupling**: UI never directly calls storage

#### R7: Non-Breaking Change
- **Requirement**: Existing functionality must remain 100% intact
- **Constraint**: Additive changes only (no modification of existing code paths)
- **Verification**: All existing features continue to work identically

#### R8: Accessibility
- **Requirement**: Keyboard navigation must support delete action
- **Constraint**: Must not break existing keyboard navigation
- **Method**: Delete key when item focused, or dedicated keyboard shortcut

#### R9: Performance
- **Requirement**: Zero perceptible latency
- **Constraint**: Hover detection must be instant (<16ms)
- **Method**: CSS transitions for smooth animations
- **Optimization**: Lazy event listener attachment

#### R10: Error Handling
- **Requirement**: Graceful degradation on failure
- **Constraint**: Never leave UI in broken state
- **Method**: Toast notification on error, maintain current view

---

## Part 2: Algorithm Design (100% Predictive Power)

### Algorithm: DELETE_FEATURE_IMPLEMENTATION

```
ALGORITHM: DELETE_FEATURE_IMPLEMENTATION
INPUT: Existing codebase (UIService, StorageService, background.ts, content.ts, types.ts)
OUTPUT: Delete functionality for prompts and contexts

STEP 1: EXTEND TYPE SYSTEM (types.ts)
  └─ Add DELETE_PROMPT_REQUEST message type
  └─ Add DELETE_PROMPT_RESPONSE message type
  └─ [VERIFICATION: TypeScript compilation succeeds]
  └─ [PREDICTABILITY: 100% - type system enforces correctness]

STEP 2: EXTEND UI SERVICE INTERFACE (core/ui-service.ts)
  └─ Add showDeleteConfirmationModal() method to IUIService
     ├─ Input: itemName (string), itemType ('prompt' | 'context')
     ├─ Output: Promise<boolean> (true = confirm, false = cancel)
     └─ [VERIFICATION: Interface contract defined]
  └─ [PREDICTABILITY: 100% - interface defines contract]

STEP 3: IMPLEMENT DELETE BUTTON IN SELECTOR (core/ui-service.ts)
  └─ Modify showPromptSelector():
     ├─ For each prompt button:
     │  ├─ Create container div (flex layout: name left, delete right)
     │  ├─ Create delete button element (initially hidden)
     │  ├─ Style delete button (dark theme, minus symbol, right-aligned)
     │  ├─ Attach hover listener to prompt button:
     │  │  └─ Show delete button (opacity: 0 → 1, transition)
     │  ├─ Attach mouseleave listener to container:
     │  │  └─ Hide delete button (opacity: 1 → 0, transition)
     │  └─ Attach click listener to delete button:
     │     └─ Stop propagation (prevent prompt selection)
     │     └─ Call showDeleteConfirmationModal()
     │        ├─ If confirmed (true):
     │        │  └─ Emit delete event (custom event or callback)
     │        └─ If cancelled (false):
     │           └─ Return to selector (no action)
     └─ [VERIFICATION: Delete button appears on hover, click triggers confirmation]
  └─ Modify showContextSelector():
     └─ Apply identical pattern as showPromptSelector()
  └─ [PREDICTABILITY: 100% - deterministic DOM manipulation]

STEP 4: IMPLEMENT CONFIRMATION MODAL (core/ui-service.ts)
  └─ Implement showDeleteConfirmationModal():
     ├─ Create modal overlay (dark theme, centered)
     ├─ Create modal content:
     │  ├─ Title: "Delete [Prompt/Context]?"
     │  ├─ Message: "Are you sure you want to delete '[itemName]'?"
     │  ├─ Warning: "This action cannot be undone."
     │  ├─ Buttons:
     │  │  ├─ "No" (cancel, left side, secondary style)
     │  │  └─ "Yes" (confirm, right side, primary/destructive style)
     ├─ Attach event listeners:
     │  ├─ No button → resolve(false)
     │  ├─ Yes button → resolve(true)
     │  ├─ Escape key → resolve(false)
     │  └─ Click outside → resolve(false)
     ├─ Set up accessibility (ARIA labels, focus management)
     └─ Return Promise<boolean>
  └─ [VERIFICATION: Modal appears, buttons work, keyboard navigation works]
  └─ [PREDICTABILITY: 100% - pure UI logic, no side effects]

STEP 5: EXTEND CONTENT SCRIPT (content.ts)
  └─ Modify prompt selector callback:
     ├─ Add delete handler parameter to showPromptSelector()
     ├─ On delete confirmation:
     │  ├─ Send DELETE_PROMPT_REQUEST message to background
     │  ├─ Wait for DELETE_PROMPT_RESPONSE
     │  ├─ If success:
     │  │  ├─ Hide current selector
     │  │  ├─ Refresh prompts list (GET_PROMPTS_REQUEST)
     │  │  ├─ Show updated selector with remaining prompts
     │  │  └─ Show success toast
     │  └─ If failure:
     │     ├─ Show error toast
     │     └─ Keep selector open (item still visible)
  └─ Modify context selector callback:
     └─ Apply identical pattern (DELETE_CONTEXT_REQUEST)
  └─ [VERIFICATION: Delete flow works end-to-end]
  └─ [PREDICTABILITY: 100% - message passing pattern already established]

STEP 6: EXTEND BACKGROUND SCRIPT (background.ts)
  └─ Add DELETE_PROMPT_REQUEST handler:
     ├─ Extract id from message.payload
     ├─ Call storage.deletePromptAtomic(id)
     ├─ On success:
     │  └─ Send DELETE_PROMPT_RESPONSE { success: true }
     └─ On error:
        └─ Send DELETE_PROMPT_RESPONSE { success: false, error: message }
  └─ [VERIFICATION: Background handles delete request]
  └─ [PREDICTABILITY: 100% - follows existing DELETE_CONTEXT_REQUEST pattern]

STEP 7: STYLING SPECIFICATION (core/ui-service.ts)
  └─ Delete button styling:
     ├─ Position: absolute, right side of item container
     ├─ Size: 20px × 20px (square)
     ├─ Background: transparent → #2a2a2a on hover
     ├─ Border: 1px solid #444 → #666 on hover
     ├─ Color: #888 → #ff4444 on hover (subtle red)
     ├─ Symbol: "−" (minus, centered, 14px font)
     ├─ Opacity: 0 (hidden) → 1 (visible) on hover
     ├─ Transition: opacity 0.15s ease, background 0.15s ease
     ├─ Cursor: pointer
     └─ Z-index: higher than prompt button
  └─ Confirmation modal styling:
     ├─ Overlay: rgba(0, 0, 0, 0.7) backdrop
     ├─ Modal: #1a1a1a background, #333 border
     ├─ Yes button: #dc3545 background (destructive red)
     ├─ No button: #2a2a2a background (secondary)
     └─ Typography: white text, clear hierarchy
  └─ [VERIFICATION: Visual design matches dark theme aesthetic]
  └─ [PREDICTABILITY: 100% - CSS is deterministic]

STEP 8: EVENT HANDLING ISOLATION
  └─ Prevent event bubbling:
     ├─ Delete button click → event.stopPropagation()
     ├─ Delete button click → event.preventDefault()
     └─ [VERIFICATION: Clicking delete doesn't select prompt]
  └─ [PREDICTABILITY: 100% - event isolation is standard DOM pattern]

STEP 9: REFRESH MECHANISM
  └─ After successful deletion:
     ├─ Hide current selector (hidePromptSelector / hideContextSelector)
     ├─ Request fresh list (GET_PROMPTS_REQUEST / GET_CONTEXTS_REQUEST)
     ├─ Show updated selector (showPromptSelector / showContextSelector)
     └─ [VERIFICATION: Deleted item disappears from list]
  └─ [PREDICTABILITY: 100% - refresh pattern already used in save flow]

STEP 10: ERROR RECOVERY
  └─ On deletion failure:
     ├─ Show error toast (showSuccessToast with error message)
     ├─ Keep selector open (don't hide)
     ├─ Keep item visible (don't remove from DOM)
     └─ [VERIFICATION: Error state doesn't break UI]
  └─ [PREDICTABILITY: 100% - error handling follows existing patterns]

---

## Part 3: Implementation Order (Dependency Graph)

```
ORDER 1: types.ts (no dependencies)
  └─ Add message types
  └─ [BLOCKS: background.ts, content.ts]

ORDER 2: core/ui-service.ts (depends on types.ts)
  └─ Add confirmation modal method
  └─ Modify showPromptSelector()
  └─ Modify showContextSelector()
  └─ [BLOCKS: content.ts]

ORDER 3: background.ts (depends on types.ts)
  └─ Add DELETE_PROMPT_REQUEST handler
  └─ [BLOCKS: content.ts]

ORDER 4: content.ts (depends on all above)
  └─ Add delete handlers to prompt/context selectors
  └─ Wire up message passing
  └─ [COMPLETE: Feature ready]

```

---

## Part 4: Verification Checklist

### Functional Verification
- [ ] Hover over prompt → minus button appears smoothly
- [ ] Click minus → confirmation modal appears
- [ ] Click "No" → modal closes, selector remains
- [ ] Click "Yes" → item deleted, selector refreshes
- [ ] Deleted item no longer appears in list
- [ ] Same behavior works for contexts
- [ ] Clicking prompt name (not minus) still selects prompt
- [ ] Keyboard navigation still works (arrow keys, Enter)
- [ ] Escape key closes confirmation modal

### Non-Breaking Verification
- [ ] // command still works (prompts appear)
- [ ] @ command still works (contexts appear)
- [ ] + command still works (save prompt)
- [ ] Brain button still works (save context)
- [ ] Enhance button still works
- [ ] All existing features unchanged

### Architecture Verification
- [ ] No direct storage calls from UI
- [ ] All storage operations go through background script
- [ ] Message types properly defined
- [ ] Interface contracts maintained
- [ ] No circular dependencies introduced

### Performance Verification
- [ ] Hover response < 16ms (60fps)
- [ ] Modal appears instantly
- [ ] Deletion completes < 500ms
- [ ] No memory leaks (event listeners cleaned up)

---

## Part 5: Edge Cases & Failure Modes

### Edge Case 1: Delete last item
- **Behavior**: Show empty state ("No prompts/contexts available")
- **Verification**: Empty state message appears correctly

### Edge Case 2: Network/storage failure
- **Behavior**: Show error toast, keep item visible
- **Verification**: Error message clear, UI not broken

### Edge Case 3: Rapid clicks
- **Behavior**: Debounce delete requests (only one active at a time)
- **Verification**: Multiple clicks don't cause race conditions

### Edge Case 4: Selector closed during deletion
- **Behavior**: Complete deletion, don't reopen selector
- **Verification**: No orphaned UI elements

### Edge Case 5: Concurrent deletions
- **Behavior**: Storage service handles concurrency (atomic operations)
- **Verification**: All deletions succeed, no data corruption

---

## Part 6: Success Criteria

✅ **Feature Complete When:**
1. User can delete prompts via // selector
2. User can delete contexts via @ selector
3. Confirmation prevents accidental deletion
4. UI updates immediately after deletion
5. All existing features work identically
6. Code follows SICP principles
7. Zero breaking changes
8. Performance is imperceptible
9. Accessibility maintained
10. Error handling graceful

---

## Part 7: Implementation Confidence

**Predictability: 100%**

**Reasoning:**
- Every step is deterministic (DOM manipulation, message passing, storage operations)
- All patterns already exist in codebase (save flow, confirmation modals)
- Type system enforces correctness
- Architecture boundaries are clear
- No external dependencies or non-deterministic operations

**Risk Mitigation:**
- Incremental implementation (one step at a time)
- Verification after each step
- Non-breaking changes only (additive)
- Follows existing patterns exactly

---

END OF DESIGN DOCUMENT

