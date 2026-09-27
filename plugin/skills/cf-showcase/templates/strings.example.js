/* Copy preset for the video engine: one table per language, same keys in every language.
   The engine reads window.STR_PRESET and picks a table with ?lang=.
   Scenes read their group (hook, reveal, demo, terminal, grid, orbit, wall, end) and
   let a TIMELINE entry override any value through opts.
   chapters: one label per TIMELINE row, in order.
   Every string below is SAMPLE TEXT, and every sample string of the film starts with
   the sample marker (the word SAMPLE, a colon, a space; demo.select stays a verbatim
   phrase of demo.body): replace all of it with facts from the fact sheet, then grep the
   bundle for the marker (must be 0 hits). This comment never spells the marker. */
window.STR_PRESET = {
  en: {
    title: "Project, in 30 seconds",
    toggle: "Tiếng Việt",
    chapters: [
      "The old way",
      "Meet Project",
      "Demo",
      "Features",
      "Integrations",
      "Community",
      "Get it",
    ],
    wordmark: "SAMPLE: Project",
    tagline: "SAMPLE: One honest line about what it does.",
    hook: {
      steps: [
        "SAMPLE: Copy the text",
        "SAMPLE: Open another app",
        "SAMPLE: Paste and wait",
        "SAMPLE: Copy the result back",
      ],
      question: "SAMPLE: What if it took one click?",
    },
    reveal: {
      tagline: "SAMPLE: One honest line about what it does.",
    },
    demo: {
      window: "SAMPLE: Notes — draft.md",
      body: "SAMPLE: Our release notes are due today and the second paragraph still reads like a first draft that nobody has had time to polish.",
      select: "reads like a first draft",
      action: "SAMPLE: Improve",
      result: "SAMPLE: needs one careful editing pass",
      apply: "SAMPLE: Apply",
      done: "SAMPLE: Applied",
      chip: "01",
      caption: "SAMPLE: Select text, pick an action, apply the result.",
    },
    terminal: {
      window: "SAMPLE: zsh — ~/project",
      prompt: "$",
      lines: [
        {
          cmd: "SAMPLE: npm install -g project-cli",
        },
        {
          out: "SAMPLE: added 1 package in 2s",
        },
        {
          cmd: "SAMPLE: project init",
        },
        {
          out: "SAMPLE: Created project.config.json",
        },
        {
          out: "SAMPLE: Ready. Run `project --help` to see every command.",
        },
      ],
      chip: "02",
      caption: "SAMPLE: Two commands from install to ready.",
    },
    grid: {
      heading: "SAMPLE: And a lot more",
      features: [
        {
          title: "SAMPLE: Fast",
          desc: "SAMPLE: Starts in under a second.",
        },
        {
          title: "SAMPLE: Private",
          desc: "SAMPLE: Your data stays on your machine.",
        },
        {
          title: "SAMPLE: Offline",
          desc: "SAMPLE: Works without a connection.",
        },
        {
          title: "SAMPLE: Checked",
          desc: "SAMPLE: Every change is verified first.",
        },
        {
          title: "SAMPLE: Streaming",
          desc: "SAMPLE: Results appear as they arrive.",
        },
        {
          title: "SAMPLE: Open",
          desc: "SAMPLE: MIT licensed, read every line.",
        },
      ],
    },
    orbit: {
      heading: "SAMPLE: Works with your tools",
      center: "SAMPLE: Project",
      items: [
        "SAMPLE: Integration A",
        "SAMPLE: Integration B",
        "SAMPLE: Integration C",
        "SAMPLE: Integration D",
        "SAMPLE: Integration E",
        "SAMPLE: Integration F",
        "SAMPLE: Integration G",
        "SAMPLE: Integration H",
      ],
      trust: "SAMPLE: One trust line from the fact sheet.",
    },
    wall: {
      count: 120,
      suffix: "+",
      sep: ",",
      label: "SAMPLE: teams already use it",
      names: [
        "SAMPLE: Acme",
        "SAMPLE: Globex",
        "SAMPLE: Initech",
        "SAMPLE: Umbrella",
        "SAMPLE: Hooli",
        "SAMPLE: Stark Labs",
        "SAMPLE: Wayne Tech",
        "SAMPLE: Soylent",
        "SAMPLE: Tyrell",
        "SAMPLE: Cyberdyne",
      ],
    },
    end: {
      cta: "SAMPLE: Get started",
      url: "SAMPLE: example.com/project",
      meta: "SAMPLE: Platforms · License",
    },
  },
  vi: {
    title: "Project trong 30 giây",
    toggle: "English",
    chapters: [
      "Cách cũ",
      "Gặp Project",
      "Minh họa",
      "Tính năng",
      "Tích hợp",
      "Cộng đồng",
      "Bắt đầu",
    ],
    wordmark: "SAMPLE: Project",
    tagline: "SAMPLE: Một câu thật về việc nó làm được.",
    hook: {
      steps: [
        "SAMPLE: Sao chép đoạn văn",
        "SAMPLE: Mở một ứng dụng khác",
        "SAMPLE: Dán vào rồi chờ",
        "SAMPLE: Chép kết quả quay lại",
      ],
      question: "SAMPLE: Nếu chỉ cần một cú nhấp thì sao?",
    },
    reveal: {
      tagline: "SAMPLE: Một câu thật về việc nó làm được.",
    },
    demo: {
      window: "SAMPLE: Ghi chú — nháp.md",
      body: "SAMPLE: Ghi chú phát hành phải xong trong hôm nay mà đoạn thứ hai vẫn đọc như bản nháp đầu tiên chưa ai kịp trau chuốt.",
      select: "đọc như bản nháp đầu tiên",
      action: "SAMPLE: Cải thiện",
      result: "SAMPLE: cần thêm một lượt biên tập kỹ",
      apply: "SAMPLE: Áp dụng",
      done: "SAMPLE: Đã áp dụng",
      chip: "01",
      caption: "SAMPLE: Chọn đoạn văn, chọn thao tác, áp dụng kết quả.",
    },
    terminal: {
      window: "SAMPLE: zsh — ~/project",
      prompt: "$",
      lines: [
        {
          cmd: "SAMPLE: npm install -g project-cli",
        },
        {
          out: "SAMPLE: added 1 package in 2s",
        },
        {
          cmd: "SAMPLE: project init",
        },
        {
          out: "SAMPLE: Created project.config.json",
        },
        {
          out: "SAMPLE: Ready. Run `project --help` to see every command.",
        },
      ],
      chip: "02",
      caption: "SAMPLE: Hai lệnh từ lúc cài đến lúc dùng được.",
    },
    grid: {
      heading: "SAMPLE: Và còn nhiều nữa",
      features: [
        {
          title: "SAMPLE: Nhanh",
          desc: "SAMPLE: Khởi động chưa tới một giây.",
        },
        {
          title: "SAMPLE: Riêng tư",
          desc: "SAMPLE: Dữ liệu ở yên trên máy bạn.",
        },
        {
          title: "SAMPLE: Ngoại tuyến",
          desc: "SAMPLE: Chạy được khi không có mạng.",
        },
        {
          title: "SAMPLE: Kiểm chứng",
          desc: "SAMPLE: Mọi thay đổi đều được kiểm tra.",
        },
        {
          title: "SAMPLE: Trực tiếp",
          desc: "SAMPLE: Kết quả hiện ra ngay khi có.",
        },
        {
          title: "SAMPLE: Mã nguồn mở",
          desc: "SAMPLE: Giấy phép MIT, đọc từng dòng.",
        },
      ],
    },
    orbit: {
      heading: "SAMPLE: Chạy cùng công cụ của bạn",
      center: "SAMPLE: Project",
      items: [
        "SAMPLE: Tích hợp A",
        "SAMPLE: Tích hợp B",
        "SAMPLE: Tích hợp C",
        "SAMPLE: Tích hợp D",
        "SAMPLE: Tích hợp E",
        "SAMPLE: Tích hợp F",
        "SAMPLE: Tích hợp G",
        "SAMPLE: Tích hợp H",
      ],
      trust: "SAMPLE: Một câu về độ tin cậy, lấy từ fact sheet.",
    },
    wall: {
      count: 120,
      suffix: "+",
      sep: ".",
      label: "SAMPLE: nhóm đang dùng mỗi ngày",
      names: [
        "SAMPLE: Acme",
        "SAMPLE: Globex",
        "SAMPLE: Initech",
        "SAMPLE: Umbrella",
        "SAMPLE: Hooli",
        "SAMPLE: Stark Labs",
        "SAMPLE: Wayne Tech",
        "SAMPLE: Soylent",
        "SAMPLE: Tyrell",
        "SAMPLE: Cyberdyne",
      ],
    },
    end: {
      cta: "SAMPLE: Bắt đầu ngay",
      url: "SAMPLE: example.com/project",
      meta: "SAMPLE: Nền tảng · Giấy phép",
    },
  },
};
