import Image from "next/image";

export default function Footer() {
  return (
    <footer className="dark:bg-navy-950 fixed right-0 bottom-0 left-0 z-40 border-t border-slate-200 bg-slate-50 md:left-64 lg:left-[300px] dark:border-[#a0a0a01c]">
      <div className="flex flex-row flex-wrap items-center gap-1 px-6 py-3 text-center text-xs text-slate-500 dark:text-slate-500">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Coding Friend" width={20} height={20} />
          <span>
            Powered by{" "}
            <a
              href="https://github.com/dinhanhthi/coding-friend"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              Coding Friend
            </a>
            , developed by{" "}
            <a
              href="https://dinhanhthi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              Anh-Thi Dinh
            </a>
            .
          </span>
        </div>
        <div>
          Learning notes hosted locally with{" "}
          <code className="rounded border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-600">
            cf host
          </code>
          .
        </div>
      </div>
    </footer>
  );
}
