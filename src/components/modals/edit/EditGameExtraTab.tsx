import { cn } from "../../../lib/utils";
import { FileText, StickyNote } from "lucide-react";
import { Label, inputCls } from "./EditGameGeneralTab";

export function EditGameExtraTab({
    description, setDescription,
    notes, setNotes
}: any) {
    return (
        <div className="space-y-5">
            <div>
                <Label>Description / Summary</Label>
                <div className="relative">
                    <FileText size={14} className="absolute left-3.5 top-3.5 text-white/20" />
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={cn(inputCls, "pl-9 resize-none")} />
                </div>
            </div>
            <div>
                <Label>Personal Notes</Label>
                <div className="relative">
                    <StickyNote size={14} className="absolute left-3.5 top-3.5 text-white/20" />
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={cn(inputCls, "pl-9 resize-none")} />
                </div>
            </div>
        </div>
    );
}
