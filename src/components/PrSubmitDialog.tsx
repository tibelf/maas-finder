import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitPr } from "@/hooks/useProjectClaims";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  claimId: string;
  projectName: string;
}

export function PrSubmitDialog({ open, onClose, claimId, projectName }: Props) {
  const [prUrl, setPrUrl] = useState("");
  const submitPr = useSubmitPr();

  const isValidUrl = () => {
    try {
      const u = new URL(prUrl);
      return u.hostname === "github.com" && /\/pull\/\d+/.test(u.pathname);
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!isValidUrl()) {
      toast.error("请输入有效的 GitHub PR 链接");
      return;
    }
    try {
      await submitPr.mutateAsync({ claimId, prUrl });
      toast.success("PR 已提交！");
      setPrUrl("");
      onClose();
    } catch (e: any) {
      toast.error(`提交失败: ${e.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>提交 Pull Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            为项目 <span className="font-medium text-foreground">{projectName}</span> 提交 PR 链接
          </p>
          <div className="space-y-2">
            <Label htmlFor="pr-url">PR 链接</Label>
            <Input
              id="pr-url"
              placeholder="https://github.com/owner/repo/pull/123"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
            />
            {prUrl && !isValidUrl() && (
              <p className="text-xs text-destructive">请输入有效的 GitHub PR 链接（如 https://github.com/owner/repo/pull/123）</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={!prUrl || !isValidUrl() || submitPr.isPending}>
            {submitPr.isPending ? "提交中..." : "确认提交"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
