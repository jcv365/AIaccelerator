import { Button, DataTable, InlineAlert } from "../../ui";

interface ConnectorRow {
  source: string;
}

// Placeholder contract — no data-source connector or re-analysis endpoint
// exists on the backend (SCREENS.md §D, APP-06). This is a static, clearly
// labeled stand-in, not a working connection flow.
const PLACEHOLDER_SOURCES: ConnectorRow[] = [{ source: "ERP export (CSV)" }];

export function ConnectorsTab() {
  return (
    <section>
      <h2>Connectors</h2>
      <InlineAlert variant="info">
        No data-source connector backend exists yet — this tab shows the intended shape with
        placeholder data, not a working connection flow.
      </InlineAlert>
      <DataTable
        rows={PLACEHOLDER_SOURCES}
        getRowKey={(row) => row.source}
        columns={[
          { key: "source", header: "Source", render: (row) => row.source },
          { key: "status", header: "Status", render: () => "Not connected" },
          { key: "action", header: "", render: () => <Button disabled>Connect</Button> },
        ]}
      />
      <Button disabled>Re-analyse (needs a connected source)</Button>
    </section>
  );
}
