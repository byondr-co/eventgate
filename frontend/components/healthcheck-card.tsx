import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props =
  | { loading: true; status?: never; database?: never; version?: never }
  | { loading?: false; status: "ok"; database: "ok" | "error"; version: string };

export function HealthcheckCard(props: Props) {
  if (props.loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Healthcheck</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Checking...</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Healthcheck</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p>Backend: {props.status}</p>
        <p>Database: {props.database}</p>
        <p className="text-muted-foreground text-sm">v{props.version}</p>
      </CardContent>
    </Card>
  );
}
