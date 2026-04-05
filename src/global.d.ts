// src/global.d.ts
declare global {
  var pendingRuns: Map<
    string,
    {
      siteId: string;
      baseUrl: string;
      journeyId: string;
      stepsJson: string;
    }
  >;
}

export {};
