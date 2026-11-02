import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BOOK_READ_MISS } from "@/lib/book/builder";
import { BookReadMiss } from "./BookReadMiss";

describe("book read miss", () => {
  it("shows the retry message and a button that reruns the build", () => {
    const html = renderToStaticMarkup(createElement(BookReadMiss, { onAgain: () => undefined }));
    expect(html).toContain("Couldn&#x27;t read the photos. Try again");
    expect(html).toContain("Try again");
    expect(BOOK_READ_MISS).toBe("Couldn't read the photos. Try again");
    expect(html).toContain("<button");
  });
});
