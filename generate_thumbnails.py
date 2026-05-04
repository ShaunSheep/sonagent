#!/usr/bin/env python3
"""
视频缩略图生成脚本
功能：读取 videos.json，为没有缩略图的视频生成首帧截图
依赖：pip install opencv-python
"""

import cv2
import json
import os
import sys
import hashlib
from pathlib import Path

# 配置
SCRIPT_DIR = Path(__file__).parent
VIDEOS_DIR = SCRIPT_DIR / 'public' / 'videos'
THUMBNAILS_DIR = SCRIPT_DIR / 'public' / 'thumbnails'
VIDEOS_JSON = SCRIPT_DIR / 'videos.json'

def ensure_dirs():
    """确保目录存在"""
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Thumbnail dir: {THUMBNAILS_DIR}")

def safe_filename(video_id):
    """将视频ID转换为安全的文件名（避免中文乱码）"""
    if video_id.isascii():
        return video_id
    # 使用 MD5 哈希生成 16 位安全文件名
    return hashlib.md5(video_id.encode('utf-8')).hexdigest()[:16]

def load_videos():
    """加载视频数据"""
    if not VIDEOS_JSON.exists():
        print(f"错误: {VIDEOS_JSON} 不存在")
        return None
    
    with open(VIDEOS_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_videos(data):
    """保存视频数据"""
    with open(VIDEOS_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def generate_thumbnail(video_path, thumbnail_path):
    """生成视频缩略图"""
    try:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            print(f"  [FAIL] Cannot open video")
            return False
        
        # 跳到第 0.5 秒位置（确保有画面）
        cap.set(cv2.CAP_PROP_POS_MSEC, 500)
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            print(f"  [FAIL] Cannot read frame")
            return False
        
        # 保存为 JPG
        cv2.imwrite(str(thumbnail_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        print(f"  [OK] Generated: {thumbnail_path.name}")
        return True
        
    except Exception as e:
        print(f"  [ERROR] {e}")
        return False

def main():
    print("=" * 50)
    print("[Video] Thumbnail Generator")
    print("=" * 50)
    
    # 检查 OpenCV
    try:
        cv2_version = cv2.__version__
        print(f"OpenCV 版本: {cv2_version}")
    except:
        print("错误: 请先安装 opencv-python")
        print("运行: pip install opencv-python")
        sys.exit(1)
    
    ensure_dirs()
    
    # 加载数据
    data = load_videos()
    if not data:
        sys.exit(1)
    
    videos = data.get('videos', [])
    if not videos:
        print("没有找到视频数据")
        sys.exit(0)
    
    print(f"\n共 {len(videos)} 个视频，开始检测缩略图...\n")
    
    updated = False
    generated = 0
    
    for video in videos:
        video_id = video.get('id', '')
        filename = video.get('filename', '')
        
        if not video_id or not filename:
            continue
        
        # 检查是否已有缩略图
        if video.get('thumbnail'):
            print(f"[SKIP] Already exists: {filename}")
            continue
        
        # 检查视频文件是否存在
        video_path = VIDEOS_DIR / filename
        if not video_path.exists():
            print(f"[WARN] Video not found: {filename}")
            continue
        
        # 生成缩略图（使用安全文件名）
        safe_name = safe_filename(video_id)
        thumbnail_path = THUMBNAILS_DIR / f"{safe_name}.jpg"
        print(f"[...] Processing: {filename}")
        
        if generate_thumbnail(video_path, thumbnail_path):
            video['thumbnail'] = f'/thumbnails/{safe_name}.jpg'
            generated += 1
            updated = True
    
    # 保存更新后的数据
    if updated:
        save_videos(data)
        print(f"\n[DONE] Generated {generated} thumbnails")
    else:
        print(f"\n[OK] All videos have thumbnails")

if __name__ == '__main__':
    main()
