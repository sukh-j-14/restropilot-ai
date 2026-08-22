import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmButton, ConfirmSubmitButton } from "../confirm-action";

test("destructive form actions require an explicit in-product confirmation step", () => {
  const html = renderToStaticMarkup(<form><ConfirmSubmitButton label="Delete" message="Delete this record?" /></form>);
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /type="submit"/);
  assert.doesNotMatch(html, /window\.confirm/);
});

test("callback actions also begin as non-submitting controls", () => {
  const html = renderToStaticMarkup(<ConfirmButton label="Reject" message="Reject this proposal?" onConfirm={() => undefined} />);
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /window\.confirm/);
});
