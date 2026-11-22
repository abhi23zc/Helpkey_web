import { DeductionWorkspace } from "@/components/finance/deduction-workspace";
import { TaxWorkspace } from "@/components/finance/tax-workspace";
import { AdminFinancePage } from "@/components/finance/workspace";
export default function Page() {
  return <><AdminFinancePage /><TaxWorkspace /><DeductionWorkspace /></>;
}
