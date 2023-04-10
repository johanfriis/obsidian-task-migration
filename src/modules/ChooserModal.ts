import { App, FuzzySuggestModal } from "obsidian";

export type ChooserOption = {
  option: string;
};

export class ChooserModal extends FuzzySuggestModal<ChooserOption> {
  options: string[];
  callback: (option: string) => void;

  constructor(app: App, options: string[]) {
    super(app);
    this.options = options;
  }

  getItems(): ChooserOption[] {
    return this.options.map((option) => ({ option }));
  }

  getItemText(item: ChooserOption) {
    return item.option;
  }

  onChooseItem(item: ChooserOption, evt: MouseEvent | KeyboardEvent): void {
    this.callback(item.option);
  }

  public start(callback: (item: string) => void): void {
    this.callback = callback;
    this.open();
  }
}
