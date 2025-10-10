#!/bin/bash
# Rename files and folders with spaces to use dashes
# Usage: ./rename-spaces.sh <directory>

if [ -z "$1" ]; then
  echo "Usage: $0 <directory>"
  exit 1
fi

TARGET_DIR="$1"

echo "Scanning for files/folders with spaces in: $TARGET_DIR"
echo ""

# Find all files and directories with spaces, process depth-first (files before dirs)
find "$TARGET_DIR" -depth -name "* *" | while IFS= read -r item; do
  # Get directory and filename
  dir=$(dirname "$item")
  name=$(basename "$item")
  
  # Replace spaces with dashes
  new_name=$(echo "$name" | tr ' ' '-')
  new_path="$dir/$new_name"
  
  if [ "$item" != "$new_path" ]; then
    echo "Renaming: $name -> $new_name"
    mv "$item" "$new_path"
  fi
done

echo ""
echo "✅ Renaming complete!"
echo ""
echo "Note: If file had attachments folder (e.g., 'File_attachments'),"
echo "it will also be renamed (e.g., 'File-name_attachments')."
