"""
Fine-tune DistilBERT for binary (or multi-class) text classification on npm package summaries.

Pipeline:
  1. dataset/enrich_data_csv.py  -> dataset/data_npm.csv (live npm data)
  2. dataset/merge_data_csv.py   -> dataset/data.csv (npm rows + optional synthetic rows)
  3. python train_model.py       -> saves weights to ./npm_model

Why: the classifier reads a single string (age, update lag, maintainers, downloads, dependents)
and outputs label probabilities; train on dataset/data.csv so input format matches inference.
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
