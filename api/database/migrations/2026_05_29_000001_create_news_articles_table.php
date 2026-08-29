<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('news_articles', function (Blueprint $table) {
            $table->id();
            $table->string('headline');
            $table->text('body')->nullable();
            $table->string('source');           // 'Dawn Business', 'Express Tribune', 'PSX Announcements'
            $table->string('url')->unique();
            $table->timestamp('published_at')->nullable();
            $table->string('sentiment')->nullable();   // positive | neutral | negative
            $table->string('impact')->nullable();       // high | medium | low
            $table->json('mentioned_symbols')->nullable();
            $table->string('category')->nullable();
            $table->text('ai_summary')->nullable();
            $table->timestamps();

            $table->index('published_at');
            $table->index('sentiment');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('news_articles');
    }
};
