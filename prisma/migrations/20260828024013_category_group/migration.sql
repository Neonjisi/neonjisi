/*
  Warnings:

  - Added the required column `group` to the `Category` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "group" TEXT NOT NULL;
