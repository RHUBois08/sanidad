-- Migration script to remove classification column from owners table
ALTER TABLE owners DROP COLUMN IF EXISTS classification;
