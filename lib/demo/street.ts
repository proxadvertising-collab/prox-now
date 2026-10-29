export type DemoStreetCheck = {
  writes: number;
  demoOnly: boolean;
  postCount: number;
  couponCount: number;
  bookKinds: string[];
  imagePaths: string[];
};

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const mark = line.indexOf("--");
      return mark === -1 ? line : line.slice(0, mark);
    })
    .join("\n");
}

function statements(sql: string): string[] {
  return stripComments(sql)
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isWrite(statement: string): boolean {
  return /^(with|delete|insert|update)\b/i.test(statement);
}

/** Reads the demo-street seed and reports whether every write is limited to is_demo shops. */
export function checkDemoStreet(sql: string): DemoStreetCheck {
  const writes = statements(sql).filter(isWrite);
  const demoOnly =
    writes.length > 0 &&
    writes.every((statement) => /is_demo\s*=\s*true/i.test(statement)) &&
    writes.every((statement) => !/is_demo\s*=\s*false/i.test(statement)) &&
    writes.every((statement) => !/\b(delete\s+from|update)\s+public\.shops\b/i.test(statement));
  const posts = writes.find((statement) => /insert\s+into\s+public\.posts\b/i.test(statement)) ?? "";
  const coupons = writes.find((statement) => /insert\s+into\s+public\.coupons\b/i.test(statement)) ?? "";
  const pages = writes.find((statement) => /insert\s+into\s+public\.shop_book_pages\b/i.test(statement)) ?? "";
  return {
    writes: writes.length,
    demoOnly,
    postCount: posts.match(/::uuid/g)?.length ?? 0,
    couponCount: coupons.match(/::uuid/g)?.length ?? 0,
    bookKinds: [...pages.matchAll(/'(logo|menu|hours|storefront|extra|qr|other)'/g)].map((match) => match[1]),
    imagePaths: [...pages.matchAll(/'(demo\/[^']+)'/g)].map((match) => match[1]),
  };
}
