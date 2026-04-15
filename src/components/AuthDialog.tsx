import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthContext } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

function getErrorMessage(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "邮箱或密码不正确";
  if (msg.includes("User already registered")) return "该邮箱已注册，请直接登录";
  if (msg.includes("Password should be at least")) return "密码至少需要6位";
  if (msg.includes("Unable to validate email")) return "邮箱格式不正确";
  return msg;
}

export function AuthDialog({ open, onClose }: Props) {
  const { signInWithEmail, signUpWithEmail } = useAuthContext();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmail(email, password);
        onClose();
      } else {
        await signUpWithEmail(email, password);
        setSuccess(true);
      }
    } catch (err: any) {
      setError(getErrorMessage(err.message || "操作失败，请重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setEmail("");
      setPassword("");
      setError("");
      setSuccess(false);
      setMode("login");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>{mode === "login" ? "登录" : "注册"}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">注册成功！请检查邮箱确认后登录。</p>
            <Button variant="outline" size="sm" onClick={() => { setSuccess(false); setMode("login"); }}>
              去登录
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">邮箱</Label>
              <Input
                id="auth-email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-password">密码</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="至少6位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? "没有账号？" : "已有账号？"}
              <button
                type="button"
                className="ml-1 underline hover:text-foreground transition-colors"
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              >
                {mode === "login" ? "注册" : "登录"}
              </button>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
