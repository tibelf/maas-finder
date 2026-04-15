import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddProject } from "@/hooks/useAddProject";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

function parseRepoPath(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) return trimmed;
  return null;
}

export function AddProjectDialog({ open, onClose }: Props) {
  const [input, setInput] = useState("");
  const addProject = useAddProject();

  const repoPath = parseRepoPath(input);
  const isValid = !!repoPath;

  const handleSubmit = async () => {
    if (!repoPath) return;
    try {
      const result = await addProject.mutateAsync(repoPath);
      if (result.already_existed) {
        toast.success(`项目 ${result.project.full_name} 已存在，数据已更新`);
      } else {
        toast.success(`成功添加项目 ${result.project.full_name}（${result.project.stars.toLocaleString()} ★）`);
      }
      setInput("");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "添加失败，请重试");
    }
  };

  const handleClose = () => {
    setInput("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>手动添加项目</DialogTitle>
          <DialogDescription>
            输入 GitHub 仓库地址或 owner/repo 路径，将其添加到系统中
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="repo-input">仓库地址</Label>
            <Input
              id="repo-input"
              placeholder="https://github.com/owner/repo 或 owner/repo"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && isValid && !addProject.isPending && handleSubmit()}
            />
            {input && !isValid && (
              <p className="text-xs text-destructive">
                请输入有效的 GitHub 仓库地址（如 https://github.com/owner/repo 或 owner/repo）
              </p>
            )}
            {input && isValid && (
              <p className="text-xs text-muted-foreground">将添加：{repoPath}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || addProject.isPending}
          >
            {addProject.isPending ? "添加中..." : "确认添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
