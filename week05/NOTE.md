# 学习笔记

## 问题：为什么 first-letter 可以设置 float 之类的，而 first-line 不行呢？

答： ::first-line 伪元素只能在块容器中,float无效；而 ::first-letter 伪元素选中的是 block-level element 的第一个字母。