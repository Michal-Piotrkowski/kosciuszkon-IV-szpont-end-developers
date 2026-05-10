"""
Fine-tune DistilBERT for binary (or multi-class) text classification on npm package summaries.

Expects dataset/data.csv with columns text, label (same string shape as stdio/check_npm_stdio.py:
age, update lag, maint count, downloads, dependents).

Run from HoneyBadger root:  python train_model.py  -> ./npm_model
"""

# Optional: Hugging Face Hub token for gated models, e.g. HF_TOKEN=hf_...

from datasets import load_dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

MODEL_NAME = "distilbert-base-uncased"
CSV_PATH = "dataset/data.csv"
OUTPUT_DIR = "./npm_model"


def tokenize_batch(tokenizer, examples):
    return tokenizer(examples["text"], truncation=True)


def main():
    dataset = load_dataset("csv", data_files=CSV_PATH, split="train")
    labels = [int(x) for x in dataset["label"]]
    num_labels = max(labels) + 1

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, num_labels=num_labels
    )

    tokenized = dataset.map(
        lambda batch: tokenize_batch(tokenizer, batch),
        batched=True,
        remove_columns=dataset.column_names,
    )
    tokenized = tokenized.add_column("labels", labels)

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=3,
        per_device_train_batch_size=8,
        learning_rate=5e-5,
        save_strategy="epoch",
        logging_steps=50,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized,
        processing_class=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
    )
    trainer.train()
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)


if __name__ == "__main__":
    main()
