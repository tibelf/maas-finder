import { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function clampPage(page: number, totalPages: number) {
  if (totalPages <= 0) return 1;
  return Math.min(Math.max(page, 1), totalPages);
}

export interface ListPaginationProps {
  total: number;
  totalPages: number;
  currentPage: number;
  pageInput: string;
  onPageInputChange: (value: string) => void;
  onGotoPage: (page: number) => void;
  isLoading: boolean;
  pageSize: number;
  ariaLabelForInput?: string;
}

export function ListPagination({
  total,
  totalPages,
  currentPage,
  pageInput,
  onPageInputChange,
  onGotoPage,
  isLoading,
  pageSize,
  ariaLabelForInput = "跳转页码",
}: ListPaginationProps) {
  if (isLoading || total === 0 || totalPages <= 1) return null;

  const handleJump = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      onPageInputChange(String(currentPage));
      return;
    }
    onGotoPage(clampPage(parsed, totalPages));
  };

  const handlePageInputBlur = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      onPageInputChange(String(currentPage));
      return;
    }
    onPageInputChange(String(clampPage(parsed, totalPages)));
  };

  const handlePageInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleJump();
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
      <p className="text-sm text-muted-foreground">
        共 {total} 条，第 {currentPage} / {totalPages} 页，每页 {pageSize} 条
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onGotoPage(1)} disabled={currentPage === 1}>
          首页
        </Button>
        <Button variant="outline" size="sm" onClick={() => onGotoPage(currentPage - 1)} disabled={currentPage === 1}>
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onGotoPage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          下一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onGotoPage(totalPages)}
          disabled={currentPage === totalPages}
        >
          尾页
        </Button>
        <Input
          value={pageInput}
          onChange={(event) => onPageInputChange(event.target.value)}
          onBlur={handlePageInputBlur}
          onKeyDown={handlePageInputKeyDown}
          className="h-8 w-20"
          inputMode="numeric"
          aria-label={ariaLabelForInput}
        />
        <Button variant="secondary" size="sm" onClick={handleJump}>
          跳转
        </Button>
      </div>
    </div>
  );
}
