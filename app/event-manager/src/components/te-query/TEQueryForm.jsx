import { TextInput } from "../shared/TextInput.jsx";
import { Button } from "../shared/Button.jsx";
import { ToggleField } from "../shared/ToggleField.jsx";
import { Toast } from "../shared/Toast.jsx";
import { useCallback, useMemo, useState } from "react";
import { queryTeEventsProxy } from "../../api/teProxy.js";
import {
  mapTeFetchErrorToMessage,
  mapTeQueryResultToFeedback,
} from "../../lib/teQueryFeedback.js";

export function TEQueryForm({ mode = "single", onQuerySuccess }) {
  const [eventId, setEventId] = useState("");
  const [performerId, setPerformerId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryTreeEnabled, setCategoryTreeEnabled] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [toastVariant, setToastVariant] = useState("success");
  const [loading, setLoading] = useState(false);

  const clearToast = useCallback(() => setToastMsg(""), []);

  const canUseCategoryTree = useMemo(() => {
    if (mode !== "bulk") return false;
    const v = String(categoryId ?? "").trim();
    return v.length > 0;
  }, [categoryId, mode]);

  function parsePositiveInt(value) {
    const n = Number.parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setValidationError("");

    const eventIdTrim = eventId.trim();
    const performerTrim = performerId.trim();
    const venueTrim = venueId.trim();
    const categoryTrim = categoryId.trim();

    let payload;
    if (mode === "single") {
      if (!eventIdTrim) {
        setValidationError("Enter an event ID.");
        return;
      }
      const parsedEventId = parsePositiveInt(eventIdTrim);
      if (!parsedEventId) {
        setValidationError("Event ID must be a positive integer.");
        return;
      }
      payload = { mode: "show", event_id: parsedEventId };
    } else {
      if (!performerTrim && !venueTrim && !categoryTrim) {
        setValidationError(
          "Enter at least one filter: performer ID, venue ID, or category ID.",
        );
        return;
      }
      if (categoryTreeEnabled && !categoryTrim) {
        setValidationError("Include subcategories requires category ID.");
        return;
      }

      const parsedPerformerId = performerTrim
        ? parsePositiveInt(performerTrim)
        : null;
      const parsedVenueId = venueTrim ? parsePositiveInt(venueTrim) : null;
      const parsedCategoryId = categoryTrim
        ? parsePositiveInt(categoryTrim)
        : null;

      if (performerTrim && !parsedPerformerId) {
        setValidationError("Performer ID must be a positive integer.");
        return;
      }
      if (venueTrim && !parsedVenueId) {
        setValidationError("Venue ID must be a positive integer.");
        return;
      }
      if (categoryTrim && !parsedCategoryId) {
        setValidationError("Category ID must be a positive integer.");
        return;
      }

      payload = {
        mode: "index",
        performer_id: parsedPerformerId ?? undefined,
        venue_id: parsedVenueId ?? undefined,
        category_id: parsedCategoryId ?? undefined,
        category_tree: categoryTrim ? categoryTreeEnabled : undefined,
      };
    }

    setLoading(true);
    try {
      const result = await queryTeEventsProxy(payload);
      onQuerySuccess?.(Array.isArray(result?.events) ? result.events : []);
      const count = result?.count ?? 0;
      const queryMode = mode === "single" ? "single" : "bulk";
      const feedback = mapTeQueryResultToFeedback(count, queryMode);
      setToastVariant(feedback.kind === "empty" ? "empty" : "success");
      setToastMsg(feedback.message);
    } catch {
      setToastVariant("error");
      setToastMsg(mapTeFetchErrorToMessage());
    } finally {
      setLoading(false);
    }
  }

  const validationBlock = validationError ? (
    <div className="em-query-fetch-bar__feedback" aria-live="polite">
      <div className="em-note em-note--inline em-note--error" role="alert">
        {validationError}
      </div>
    </div>
  ) : null;

  if (mode === "single") {
    return (
      <form className="em-form em-form--add-events" onSubmit={onSubmit}>
        <div className="em-search-bar">
          <TextInput
            label="Event ID"
            placeholder="e.g. 2795412"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "Fetching…" : "Fetch event"}
          </Button>
          {validationBlock}
        </div>
        <Toast message={toastMsg} variant={toastVariant} onDone={clearToast} />
      </form>
    );
  }

  return (
    <form className="em-form em-form--add-events" onSubmit={onSubmit}>
      <div className="em-form-row em-form-row--wrap em-bulk-query-grid">
        <TextInput
          label="Performer ID"
          placeholder="Optional"
          value={performerId}
          onChange={(e) => setPerformerId(e.target.value)}
        />
        <TextInput
          label="Venue ID"
          placeholder="Optional"
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
        />
        <TextInput
          label="Category ID"
          placeholder="Optional"
          value={categoryId}
          onChange={(e) => {
            const next = e.target.value;
            setCategoryId(next);
            if (String(next ?? "").trim().length === 0)
              setCategoryTreeEnabled(false);
          }}
        />
        <div className="em-bulk-query-actions">
          <ToggleField
            label="Include subcategories"
            checked={categoryTreeEnabled}
            disabled={!canUseCategoryTree}
            onChange={setCategoryTreeEnabled}
          />
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "Fetching…" : "Fetch events"}
          </Button>
        </div>
      </div>
      {validationBlock}
      <Toast message={toastMsg} variant={toastVariant} onDone={clearToast} />
    </form>
  );
}
