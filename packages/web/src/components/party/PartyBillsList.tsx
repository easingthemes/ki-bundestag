import { Link } from "react-router-dom";
import { type Bill } from "../../api";
import { ShowMoreButton } from "../shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE } from "@/lib/colors";

interface PartyBillsListProps {
  bills: Bill[];
  visibleBills: number;
  onShowMore: () => void;
}

export function PartyBillsList({ bills, visibleBills, onShowMore }: PartyBillsListProps) {
  if (bills.length === 0) {
    return <p className="text-sm text-muted-foreground">No bills proposed yet.</p>;
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[480px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 border-b-2 border-border">Title</th>
              <th className="text-left px-3 py-2 border-b-2 border-border">Category</th>
              <th className="text-center px-3 py-2 border-b-2 border-border">Day</th>
              <th className="text-center px-3 py-2 border-b-2 border-border">Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.slice(0, visibleBills).map(b => (
              <tr key={b.id}>
                <td className="px-3 py-2 border-b border-border">
                  <Link to={`/bills/${b.id}`} className="text-inherit no-underline hover:text-primary">{b.title}</Link>
                </td>
                <td className="px-3 py-2 border-b border-border text-muted-foreground">{b.category}</td>
                <td className="px-3 py-2 border-b border-border text-center">{b.proposedOnDay}</td>
                <td className="px-3 py-2 border-b border-border text-center">
                  <Badge variant="outline" className={STATUS_BADGE[b.status] || ""}>{b.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ShowMoreButton
          total={bills.length}
          visible={Math.min(visibleBills, bills.length)}
          increment={5}
          onShowMore={onShowMore}
        />
      </CardContent>
    </Card>
  );
}
